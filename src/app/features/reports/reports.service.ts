import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    QueryDocumentSnapshot,
    Timestamp,
    collection,
    count,
    getAggregateFromServer,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
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
 * Cobros REALES del rango (regla de negocio: una Gift Card es ingreso cuando
 * SE VENDE, no cuando se canjea). ÚNICA fórmula — pantalla y PDF la comparten:
 *
 * - efectivo recibido = efectivo de ventas + efectivo de emisiones de Gift Card
 * - QR recibido       = QR de ventas + QR de emisiones de Gift Card
 * - cobros totales    = efectivo recibido + QR recibido
 *
 * `giftCardCents` (Gift Card APLICADA como pago) y `giftCardForfeitedCents`
 * (sobrante de un canje menor al nominal) NO entran: ese dinero ya se cobró al
 * vender la tarjeta. La diferencia que se paga en efectivo/QR durante un canje
 * sí entra, porque ya está dentro de `cashCents`/`qrCents` de la venta.
 */
export function receivedTotals(
    t: Pick<RangeTotals, 'cashCents' | 'qrCents' | 'giftCardIssuesCashCents' | 'giftCardIssuesQrCents'>,
): { cashCents: number; qrCents: number; totalCents: number } {
    const cashCents = t.cashCents + t.giftCardIssuesCashCents;
    const qrCents = t.qrCents + t.giftCardIssuesQrCents;
    return { cashCents, qrCents, totalCents: cashCents + qrCents };
}

/**
 * Gift Cards VENDIDAS (emitidas) por un vendedor en un rango, sumadas de sus
 * `giftCardIssues` — atribución por `activatedBy`, el campo real que guarda
 * quién hizo la venta de la tarjeta. Incluye TODOS los estados, también los
 * ciclos `cancelled`: una baja administrativa no es devolución, el ingreso
 * de la venta permanece.
 */
export interface SellerIssuesTotals {
    issuesCount: number;
    nominalCents: number;
    cashCents: number;
    qrCents: number;
}

/** Suma nominal y cobro (efectivo/QR) de una lista de ciclos. Pura: la comparten consulta y tests. */
export function sumIssues(issues: Pick<GiftCardIssue, 'amountCents' | 'payments'>[]): SellerIssuesTotals {
    const totals: SellerIssuesTotals = { issuesCount: issues.length, nominalCents: 0, cashCents: 0, qrCents: 0 };
    for (const issue of issues) {
        totals.nominalCents += issue.amountCents;
        for (const payment of issue.payments ?? []) {
            if (payment.method === 'cash') totals.cashCents += payment.amountCents;
            else if (payment.method === 'qr') totals.qrCents += payment.amountCents;
        }
    }
    return totals;
}

/**
 * Desglose de UN vendedor: sus ventas de mercadería + las Gift Cards que vendió.
 * Pantalla y PDF muestran EXACTAMENTE este objeto (una sola fórmula, la misma
 * `receivedTotals` del reporte general):
 *
 * - efectivo recibido = efectivo de sus ventas (incluye la diferencia de un
 *   canje) + efectivo de las tarjetas que vendió
 * - QR recibido       = ídem con QR
 * - cobros recibidos  = efectivo + QR recibidos
 *
 * `giftCardCents` (Gift Card APLICADA en sus ventas) no es dinero nuevo y no suma.
 */
export interface SellerBreakdown {
    salesCount: number;
    merchandiseCents: number;
    salesCashCents: number;
    salesQrCents: number;
    giftCardAppliedCents: number;
    giftCardsSoldCount: number;
    giftCardsSoldCents: number;
    issuesCashCents: number;
    issuesQrCents: number;
    cashReceivedCents: number;
    qrReceivedCents: number;
    moneyReceivedCents: number;
}

export function buildSellerBreakdown(sales: SalesAggregateTotals, issues: SellerIssuesTotals): SellerBreakdown {
    const received = receivedTotals({
        cashCents: sales.cashCents,
        qrCents: sales.qrCents,
        giftCardIssuesCashCents: issues.cashCents,
        giftCardIssuesQrCents: issues.qrCents,
    });
    return {
        salesCount: sales.salesCount,
        merchandiseCents: sales.totalCents,
        salesCashCents: sales.cashCents,
        salesQrCents: sales.qrCents,
        giftCardAppliedCents: sales.giftCardCents,
        giftCardsSoldCount: issues.issuesCount,
        giftCardsSoldCents: issues.nominalCents,
        issuesCashCents: issues.cashCents,
        issuesQrCents: issues.qrCents,
        cashReceivedCents: received.cashCents,
        qrReceivedCents: received.qrCents,
        moneyReceivedCents: received.totalCents,
    };
}

/**
 * Tamaño de cada página INTERNA de la consulta por vendedor. No es un tope: el
 * recorrido sigue hasta agotar los resultados (ver `sumAllIssuePages`). Solo
 * acota lo que se descarga por petición.
 */
export const SELLER_ISSUES_PAGE_SIZE = 500;

/** Un ciclo tal como lo necesita la suma: identidad (para no contar dos veces), monto y cobro. */
export type IssueForTotals = Pick<GiftCardIssue, 'id' | 'amountCents' | 'payments'>;

export interface IssuesPage<Cursor> {
    items: IssueForTotals[];
    /** Cursor del ÚLTIMO documento de la página (`null` si la página está vacía). */
    last: Cursor | null;
}

/**
 * Recorre TODAS las páginas de una consulta con cursor y acumula el resultado,
 * sin ningún tope oculto: se detiene solo cuando una página viene incompleta
 * (`items.length < pageSize`, incluida la vacía). Una página EXACTAMENTE del
 * tamaño pedido obliga a pedir la siguiente, que vendrá vacía y cierra el
 * recorrido. Defensa: un ciclo se cuenta UNA sola vez por `id` aunque una
 * página repitiera documentos, y si una página no aporta nada nuevo se corta
 * (nunca un bucle infinito). Incluye ciclos de cualquier estado, también los
 * `cancelled`: una baja administrativa no es devolución.
 *
 * Genérica en el cursor para poder probarla sin Firestore.
 */
export async function sumAllIssuePages<Cursor>(
    fetchPage: (after: Cursor | null) => Promise<IssuesPage<Cursor>>,
    pageSize: number = SELLER_ISSUES_PAGE_SIZE,
): Promise<SellerIssuesTotals> {
    const seen = new Set<string>();
    const unique: IssueForTotals[] = [];
    let after: Cursor | null = null;

    for (;;) {
        const page: IssuesPage<Cursor> = await fetchPage(after);
        let added = 0;
        for (const item of page.items) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            unique.push(item);
            added += 1;
        }
        if (page.items.length < pageSize || page.last === null || added === 0) break;
        after = page.last;
    }
    return sumIssues(unique);
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
     * Gift Cards que UN vendedor vendió en el rango: consulta en servidor por
     * `activatedBy` + rango de `dateKey` (índice compuesto
     * `giftCardIssues(activatedBy, dateKey)`) recorrida por PÁGINAS INTERNAS con
     * cursor (`SELLER_ISSUES_PAGE_SIZE`) hasta agotar los resultados: sin tope
     * oculto, así un rango con miles de emisiones nunca se muestra incompleto.
     * Cash/QR salen de `payments[]` (un array: `sum()` de servidor no aplica),
     * por eso se leen los ciclos del vendedor y se suman con `sumAllIssuePages`.
     */
    getSellerIssuesTotals(sellerId: string, fromKey: string, toKey: string): Observable<SellerIssuesTotals> {
        return from(
            sumAllIssuePages<QueryDocumentSnapshot<GiftCardIssue>>(async (after) => {
                const snap = await getDocs(this.sellerIssuesQuery(sellerId, fromKey, toKey, after));
                return { items: snap.docs.map((d) => d.data()), last: snap.docs.at(-1) ?? null };
            }),
        );
    }

    /**
     * Una página de la consulta de arriba, expuesta para poder verificar su forma
     * (y el índice que exige) sin red. `orderBy('dateKey')` es el mismo orden del
     * índice `(activatedBy, dateKey)`; `startAfter(snapshot)` desempata por id de
     * documento, así que no hay huecos ni repetidos entre páginas.
     */
    sellerIssuesQuery(
        sellerId: string,
        fromKey: string,
        toKey: string,
        after: QueryDocumentSnapshot<GiftCardIssue> | null = null,
    ) {
        return query(
            this.giftCardIssuesCollection,
            where('activatedBy', '==', sellerId),
            where('dateKey', '>=', fromKey),
            where('dateKey', '<=', toKey),
            orderBy('dateKey'),
            ...(after ? [startAfter(after)] : []),
            limit(SELLER_ISSUES_PAGE_SIZE),
        );
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
