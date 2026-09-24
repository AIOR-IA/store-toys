import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    Timestamp,
    collection,
    count,
    getAggregateFromServer,
    getDocs,
    limit,
    orderBy,
    query,
    sum,
    where,
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { CursorPager, PageSize } from '@core/data';
import { giftCardIssueConverter } from '../gift-cards/gift-card.converter';
import { GiftCardIssue } from '../gift-cards/gift-card.model';
import { dailySummaryConverter } from './daily-summary.converter';
import { DailySummary } from './daily-summary.model';

/**
 * Totales de dinero de `sales`, calculados en servidor con
 * `getAggregateFromServer` (plan §18.3): es la mitad "independiente" de la
 * verificación de integridad — la otra mitad son los mismos campos ya
 * acumulados en `dailySummaries`. Si difieren, algo hay que arreglar.
 */
export interface SalesAggregateTotals {
    salesCount: number;
    totalCents: number;
    cashCents: number;
    qrCents: number;
    giftCardCents: number;
}

/**
 * Acumulado de un rango de `dailySummaries` (Fase 7): la suma de los
 * documentos diarios del rango, más el detalle por producto fusionado
 * (plan §18.3, "el detalle por producto... acumulado en el cliente").
 */
export interface RangeTotals {
    salesCount: number;
    itemsCount: number;
    totalCents: number; // mercadería vendida NETA (después de rebajas)
    discountCents: number; // rebajas aplicadas en el rango (mercadería bruta = total + rebajas)
    cashCents: number;
    qrCents: number;
    giftCardCents: number;
    giftCardsIssuedCents: number;
    giftCardForfeitedCents: number;
    giftCardIssuesCashCents: number;
    giftCardIssuesQrCents: number;
    products: Record<string, { code: string; name: string; qty: number; totalCents: number }>;
    /** Cuántos `dailySummaries/{dateKey}` del rango existen (hubo actividad ese día). */
    daysWithData: number;
}

function emptyRangeTotals(): RangeTotals {
    return {
        salesCount: 0,
        itemsCount: 0,
        totalCents: 0,
        discountCents: 0,
        cashCents: 0,
        qrCents: 0,
        giftCardCents: 0,
        giftCardsIssuedCents: 0,
        giftCardForfeitedCents: 0,
        giftCardIssuesCashCents: 0,
        giftCardIssuesQrCents: 0,
        products: {},
        daysWithData: 0,
    };
}

/**
 * Acumula una lista de `DailySummary` en un solo `RangeTotals` (plan §18.3).
 * Exportada aparte de la clase porque el componente la reutiliza sobre la
 * MISMA lista que ya pidió para el gráfico "ventas por día" — nunca se piden
 * los `dailySummaries` del rango dos veces.
 */
export function mergeDailySummaries(summaries: DailySummary[]): RangeTotals {
    const totals = emptyRangeTotals();
    for (const summary of summaries) {
        totals.salesCount += summary.salesCount;
        totals.itemsCount += summary.itemsCount;
        totals.totalCents += summary.totalCents;
        totals.discountCents += summary.discountCents;
        totals.cashCents += summary.cashCents;
        totals.qrCents += summary.qrCents;
        totals.giftCardCents += summary.giftCardCents;
        totals.giftCardsIssuedCents += summary.giftCardsIssuedCents;
        totals.giftCardForfeitedCents += summary.giftCardForfeitedCents;
        totals.giftCardIssuesCashCents += summary.giftCardIssuesCashCents;
        totals.giftCardIssuesQrCents += summary.giftCardIssuesQrCents;
        totals.daysWithData += 1;

        for (const [productId, entry] of Object.entries(summary.products ?? {})) {
            const existing = totals.products[productId];
            totals.products[productId] = {
                code: entry.code,
                name: entry.name,
                qty: (existing?.qty ?? 0) + entry.qty,
                totalCents: (existing?.totalCents ?? 0) + entry.totalCents,
            };
        }
    }
    return totals;
}

/**
 * Fuente de datos de Reportes/Cierre de caja (Fase 7, plan §18, §19, roadmap
 * Fase 7). Todo es de SOLO LECTURA — Rules ya cierran la escritura de
 * `dailySummaries`/`sales`/`giftCardIssues`/`giftCardMovements` desde el
 * cliente (plan §10.2) desde fases anteriores; esta fase no toca ni Rules ni
 * Functions, solo lee lo que ya existe (CLAUDE.md §35, "justifica antes de
 * añadir una Function de reporting" — no hizo falta ninguna).
 *
 * Camino principal (barato): un rango de `dailySummaries` cuesta tantas
 * lecturas como días tiene el rango (1 por ID) — nunca se recorre `sales`
 * completo para agregar. El camino secundario (`sales` con
 * `getAggregateFromServer`) es EXCLUSIVAMENTE para la verificación de
 * integridad y el desglose por vendedor (plan §18.3, §29): en ambos casos
 * son sumas en servidor, nunca se descargan los documentos.
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
    private readonly firestore = inject(Firestore);

    private readonly summariesCollection = collection(this.firestore, 'dailySummaries').withConverter(
        dailySummaryConverter,
    );
    private readonly salesCollection = collection(this.firestore, 'sales');
    private readonly giftCardIssuesCollection = collection(
        this.firestore,
        'giftCardIssues',
    ).withConverter(giftCardIssueConverter);
    private readonly giftCardMovementsCollection = collection(this.firestore, 'giftCardMovements');

    /**
     * Los `dailySummaries` del rango, uno por día (plan §18.3): tope de 400
     * documentos (un año son 365) — nunca `getDocs` sin `limit()` (CLAUDE.md,
     * "Datos"). Es la fuente tanto de los totales acumulados (`mergeDailySummaries`)
     * como del gráfico "ventas por día", que necesita el desglose diario.
     */
    getSummariesInRange(fromKey: string, toKey: string): Observable<DailySummary[]> {
        return from(
            getDocs(
                query(
                    this.summariesCollection,
                    where('dateKey', '>=', fromKey),
                    where('dateKey', '<=', toKey),
                    orderBy('dateKey'),
                    limit(400),
                ),
            ),
        ).pipe(map((snap) => snap.docs.map((d) => d.data())));
    }

    /**
     * La mitad "independiente" de la verificación de integridad (plan
     * §18.3, roadmap Fase 7 punto 6): `sum()`/`count()` en SERVIDOR sobre
     * `sales`, filtrado a `status == 'completed'` — nunca se descargan los
     * documentos.
     *
     * Requiere el índice compuesto `sales(status, dateKey, cashCents,
     * giftCardCents, qrCents, totalCents)` — verificado en vivo: Firestore
     * exige que CADA campo sumado (`sum()`) forme parte del índice compuesto,
     * no solo los campos de `where`/`orderBy` (a diferencia de un `count()`
     * simple, que con esta misma cantidad de filtros no lo pide). El primer
     * intento solo indexaba `status, dateKey` y fallaba con
     * `failed-precondition` pese a que el índice existía y estaba
     * `Habilitado` — el mensaje de error de Firestore trae la forma exacta
     * que hace falta.
     */
    getSalesIntegrity(fromKey: string, toKey: string): Observable<SalesAggregateTotals> {
        const q = query(
            this.salesCollection,
            where('status', '==', 'completed'),
            where('dateKey', '>=', fromKey),
            where('dateKey', '<=', toKey),
        );
        return from(
            getAggregateFromServer(q, {
                salesCount: count(),
                totalCents: sum('totalCents'),
                cashCents: sum('cashCents'),
                qrCents: sum('qrCents'),
                giftCardCents: sum('giftCardCents'),
            }),
        ).pipe(map((snap) => snap.data()));
    }

    /**
     * Ventas de UN vendedor en el rango (plan §29, prompt §29): `dailySummaries`
     * no distingue vendedor, así que este desglose sale de `sales` con
     * `getAggregateFromServer` — solo cuando el admin filtra por vendedor,
     * nunca una consulta por cada vendedor de la lista (prompt §26).
     *
     * Requiere el índice compuesto `sales(sellerId, status, dateKey,
     * cashCents, giftCardCents, qrCents, totalCents)` — mismo motivo que
     * `getSalesIntegrity` de arriba (los campos sumados deben estar en el
     * índice).
     */
    getSellerTotals(sellerId: string, fromKey: string, toKey: string): Observable<SalesAggregateTotals> {
        const q = query(
            this.salesCollection,
            where('sellerId', '==', sellerId),
            where('status', '==', 'completed'),
            where('dateKey', '>=', fromKey),
            where('dateKey', '<=', toKey),
        );
        return from(
            getAggregateFromServer(q, {
                salesCount: count(),
                totalCents: sum('totalCents'),
                cashCents: sum('cashCents'),
                qrCents: sum('qrCents'),
                giftCardCents: sum('giftCardCents'),
            }),
        ).pipe(map((snap) => snap.data()));
    }

    /**
     * Ciclos de Gift Card activados en el rango (plan §16.1, prompt §12):
     * `giftCardIssues.dateKey` es la fecha de ACTIVACIÓN del ciclo, un solo
     * campo con rango — no hace falta índice compuesto nuevo aparte del de
     * orden (`giftCardIssues(dateKey, activatedAt)`).
     */
    createIssuesPager(fromKey: string, toKey: string, pageSize: PageSize): CursorPager<GiftCardIssue> {
        const baseConstraints = () => [
            where('dateKey', '>=', fromKey),
            where('dateKey', '<=', toKey),
            orderBy('dateKey', 'desc'),
            orderBy('activatedAt', 'desc'),
        ];

        return new CursorPager<GiftCardIssue>(
            (extra) => query(this.giftCardIssuesCollection, ...baseConstraints(), ...extra),
            () => query(this.giftCardIssuesCollection, ...baseConstraints()),
            pageSize,
        );
    }

    /**
     * Cuántos ciclos de Gift Card se ACTIVARON en el rango (prompt §30,
     * "activaciones/issues") — conteo en servidor, mismo filtro de un solo
     * campo que el pager de arriba.
     */
    getIssuesCountInRange(fromKey: string, toKey: string): Observable<number> {
        const q = query(
            this.giftCardIssuesCollection,
            where('dateKey', '>=', fromKey),
            where('dateKey', '<=', toKey),
        );
        return from(getAggregateFromServer(q, { total: count() })).pipe(map((snap) => snap.data().total));
    }

    /**
     * Cuántos canjes (`type == 'REDEEMED'`) ocurrieron en el rango (prompt
     * §30, "redenciones"). `giftCardMovements` guarda `createdAt`
     * (Timestamp), no un `dateKey` propio — por eso el rango se convierte a
     * límites de Timestamp en la zona del negocio (`dateKeyRangeToTimestampBounds`).
     * Requiere el índice compuesto `giftCardMovements(type, createdAt)`.
     */
    getRedemptionsCountInRange(start: Timestamp, end: Timestamp): Observable<number> {
        const q = query(
            this.giftCardMovementsCollection,
            where('type', '==', 'REDEEMED'),
            where('createdAt', '>=', start),
            where('createdAt', '<', end),
        );
        return from(getAggregateFromServer(q, { total: count() })).pipe(map((snap) => snap.data().total));
    }
}
