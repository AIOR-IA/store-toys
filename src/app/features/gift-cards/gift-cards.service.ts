import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, firstValueFrom, from, map } from 'rxjs';
import { PageResult, PageSize, CursorPager } from '@core/data';
import { normalizeGiftCardCode } from '@core/utils';
import { giftCardConverter, giftCardIssueConverter, giftCardMovementConverter } from './gift-card.converter';
import {
    GiftCard,
    GiftCardIssue,
    GiftCardIssuePayment,
    GiftCardMovement,
    GiftCardReceipt,
    GiftCardReplaceMode,
    GiftCardStatus,
} from './gift-card.model';

export type GiftCardsFilter = 'all' | GiftCardStatus;

/**
 * Historial de emisiones/ventas reales de Gift Card (ajuste posterior,
 * Recibo/Historial — ver `listGiftCardIssues` en `functions/src/giftcards.ts`
 * para la justificación completa). Espejo de `SalesHistoryFilter`
 * (`sales.service.ts`): `sellerId` solo lo usa el admin, el vendedor
 * siempre ve las suyas (la Function lo fuerza server-side, nunca se confía
 * en lo que mande el cliente).
 */
export interface GiftCardIssuesHistoryFilter {
    cardCode?: string;
    sellerId?: string;
}

interface ListIssuesCursorDto {
    activatedAtMs: number;
    id: string;
}

interface GiftCardIssueDto {
    id: string;
    cardCode: string;
    cycleNumber: number;
    amountCents: number;
    buyerName: string | null;
    activatedAtMs: number;
    activatedBy: string;
    activatedByName: string;
    dateKey: string;
    payments: GiftCardIssuePayment[];
}

interface ListIssuesResponse {
    rows: GiftCardIssueDto[];
    hasNext: boolean;
    total: number;
    nextCursor: ListIssuesCursorDto | null;
}

/**
 * `activatedAtMs` (número) → `Timestamp` real: la respuesta de un
 * `httpsCallable` es JSON plano, nunca un `Timestamp` de
 * `@angular/fire/firestore` (a diferencia de un `getDoc` con `withConverter`)
 * — hay que reconstruirlo para que `formatInStoreTimezone` (el mismo que usa
 * el recibo de Ventas) pueda seguir llamando `.toDate()` sin distinguir de
 * dónde vino el dato.
 */
function dtoToReceipt(dto: GiftCardIssueDto): GiftCardReceipt {
    return {
        id: dto.id,
        cardCode: dto.cardCode,
        cycleNumber: dto.cycleNumber,
        amountCents: dto.amountCents,
        buyerName: dto.buyerName,
        activatedAt: Timestamp.fromMillis(dto.activatedAtMs),
        activatedByName: dto.activatedByName,
        dateKey: dto.dateKey,
        payments: dto.payments,
    };
}

/**
 * Paginador del Historial de Gift Cards — mismo contrato público que
 * `CursorPager` (`first/next/prev` → `PageResult`), pero sobre la Function
 * `listGiftCardIssues` en vez de una `Query` directa de Firestore:
 * `giftCardIssues` es `allow get, list: if isAdmin()` en las Rules (plan
 * §16.1) y esta pantalla también la usa el vendedor para sus propias
 * emisiones — el cursor por lo tanto también vive del lado del servidor
 * (ver el comentario largo de la Function). `cursors[i]` = el cursor que
 * `listGiftCardIssues` devolvió al pedir la página `i` — exactamente el
 * mismo invariante que `CursorPager.cursors[i]` (el último documento de esa
 * página), solo que aquí es un valor opaco que la Function ya resolvió.
 */
class GiftCardIssuesPager {
    private cursors: (ListIssuesCursorDto | null)[] = [];
    private pageIndex = 0;
    private total = 0;

    constructor(
        private readonly fetchPage: (
            cursor: ListIssuesCursorDto | null,
        ) => Promise<ListIssuesResponse>,
    ) {}

    async first(): Promise<PageResult<GiftCardReceipt>> {
        this.cursors = [];
        this.pageIndex = 0;
        return this.fetchCurrentPage();
    }

    async next(): Promise<PageResult<GiftCardReceipt>> {
        this.pageIndex += 1;
        return this.fetchCurrentPage();
    }

    async prev(): Promise<PageResult<GiftCardReceipt>> {
        if (this.pageIndex > 0) this.pageIndex -= 1;
        return this.fetchCurrentPage();
    }

    private async fetchCurrentPage(): Promise<PageResult<GiftCardReceipt>> {
        const cursor = this.pageIndex > 0 ? this.cursors[this.pageIndex - 1] ?? null : null;
        const res = await this.fetchPage(cursor);
        this.total = res.total;
        this.cursors[this.pageIndex] = res.nextCursor;
        return {
            rows: res.rows.map(dtoToReceipt),
            hasNext: res.hasNext,
            hasPrev: this.pageIndex > 0,
            total: this.total,
        };
    }
}

export interface ActivateGiftCardInput {
    code: string;
    buyerName?: string;
    payments: GiftCardIssuePayment[];
}

/**
 * Datos de `giftCards`/`giftCardIssues`/`giftCardMovements` (Fase 6, plan
 * §16). Ninguna escritura pasa por aquí de forma directa: registrar,
 * vender/activar, suspender, reactivar y cancelar definitivamente son todos
 * `httpsCallable` (Cloud Functions con Admin SDK) — las Rules cierran
 * `allow write: if false` en las tres colecciones (prompt §17, §35) por la
 * misma razón que `sales`: son operaciones que exigen leer y validar el
 * estado real dentro de una transacción.
 */
@Injectable({ providedIn: 'root' })
export class GiftCardsService {
    private readonly firestore = inject(Firestore);
    private readonly functions = inject(Functions);

    private readonly giftCardsCollection = collection(this.firestore, 'giftCards').withConverter(
        giftCardConverter,
    );
    private readonly giftCardIssuesCollection = collection(this.firestore, 'giftCardIssues').withConverter(
        giftCardIssueConverter,
    );

    /**
     * Paginador por cursores filtrado por estado (plan §12.1, prompt §32,
     * §34): con 20-40 tarjetas en total, un solo filtro server-side
     * (estado) más orden por código alcanza y sobra — denominación y
     * comprador se refinan en el cliente sobre la página ya cargada (mismo
     * criterio de "no sobreoptimizar" del prompt §34), igual que Productos
     * no combina su filtro de stock bajo con la búsqueda por nombre.
     */
    createPager(filter: GiftCardsFilter, pageSize: PageSize): CursorPager<GiftCard> {
        const baseConstraints = () => {
            const constraints = filter === 'all' ? [] : [where('status', '==', filter)];
            return [...constraints, orderBy('cardCode')];
        };

        return new CursorPager<GiftCard>(
            (extra) => query(this.giftCardsCollection, ...baseConstraints(), ...extra),
            () => query(this.giftCardsCollection, ...baseConstraints()),
            pageSize,
        );
    }

    /**
     * Lista acotada para el resumen por estado/denominación (prompt §2, §15)
     * — a la escala de la tienda (20-40 tarjetas) una sola lectura acotada
     * (nunca sin `limit()`, CLAUDE.md) alcanza para calcular ambos desgloses
     * en el cliente, sin sumar índices ni consultas nuevas.
     */
    listAllForSummary(): Observable<GiftCard[]> {
        return from(
            getDocs(query(this.giftCardsCollection, orderBy('cardCode'), limit(200))).then((snap) =>
                snap.docs.map((d) => d.data()),
            ),
        );
    }

    /** Resuelve un escaneo o un código tecleado a su tarjeta (prompt §4). 1 lectura. */
    lookupByCode(code: string): Observable<GiftCard | null> {
        const normalized = normalizeGiftCardCode(code);
        return from(getDoc(doc(this.giftCardsCollection, normalized))).pipe(
            map((snap) => (snap.exists() ? snap.data() : null)),
        );
    }

    /**
     * Recibo de UNA emisión real (`getGiftCardIssue`, Function, prompt
     * Recibo/Historial §3-§4, §16): único punto de lectura, tanto para
     * imprimir justo después de vender como para reimprimir desde el
     * Historial — así los dos caminos nunca pueden mostrar algo distinto
     * para el mismo ciclo. Rechaza un `origin: 'replacement'` (nunca genera
     * recibo de cobro) y aplica la misma regla de dueño que `sales`: el
     * vendedor solo puede traer su propia emisión, el admin cualquiera.
     */
    getIssueReceipt(issueId: string): Observable<GiftCardReceipt> {
        const callable = httpsCallable<{ issueId: string }, GiftCardIssueDto>(
            this.functions,
            'getGiftCardIssue',
        );
        return from(callable({ issueId })).pipe(map((r) => dtoToReceipt(r.data)));
    }

    /**
     * Historial de emisiones/ventas reales (`listGiftCardIssues`, Function,
     * prompt Recibo/Historial §9-§11, §15, §20): paginado por cursor, SIN
     * `giftCards` — cada ciclo de una misma tarjeta reutilizada aparece como
     * una fila independiente. Nunca incluye un `origin: 'replacement'`.
     */
    createIssuesHistoryPager(filter: GiftCardIssuesHistoryFilter, pageSize: PageSize) {
        const callable = httpsCallable<
            {
                pageSize: number;
                cursor: ListIssuesCursorDto | null;
                cardCode?: string;
                sellerId?: string;
            },
            ListIssuesResponse
        >(this.functions, 'listGiftCardIssues');

        return new GiftCardIssuesPager((cursor) =>
            firstValueFrom(
                from(
                    callable({
                        pageSize,
                        cursor,
                        cardCode: filter.cardCode,
                        sellerId: filter.sellerId,
                    }),
                ).pipe(map((r) => r.data)),
            ),
        );
    }

    /**
     * Lectura directa de UN ciclo (admin, Rules `allow get: if isAdmin()`,
     * plan §16.1 — mismo patrón ya usado por `reports.service.ts` para leer
     * `giftCardIssues` directo desde Angular). Se usa SOLO para previsualizar,
     * ANTES de confirmar, qué comprador/vendedor heredará una Gift Card
     * `AVAILABLE` elegida en el modo "Usar tarjeta existente" de
     * `replaceGiftCard` (prompt §11) — nunca reemplaza `getGiftCardIssue`,
     * que sigue siendo la única vía del RECIBO financiero (un reemplazo
     * nunca genera uno).
     */
    getIssue(issueId: string): Observable<GiftCardIssue | null> {
        return from(getDoc(doc(this.giftCardIssuesCollection, issueId))).pipe(
            map((snap) => (snap.exists() ? snap.data() : null)),
        );
    }

    /** Historial completo de una tarjeta, todos sus ciclos (admin, prompt §33). Acotado. */
    getMovements(cardCode: string): Observable<GiftCardMovement[]> {
        const movementsCollection = collection(this.firestore, 'giftCardMovements').withConverter(
            giftCardMovementConverter,
        );
        return from(
            getDocs(
                query(
                    movementsCollection,
                    where('giftCardId', '==', cardCode),
                    orderBy('createdAt', 'asc'),
                    limit(200),
                ),
            ).then((snap) => snap.docs.map((d) => d.data())),
        );
    }

    /** `registerGiftCard` (Function, admin, prompt §13): una tarjeta nueva, AVAILABLE. */
    registerGiftCard(code: string, amountCents: number): Observable<{ cardCode: string }> {
        const callable = httpsCallable<{ code: string; amountCents: number }, { cardCode: string }>(
            this.functions,
            'registerGiftCard',
        );
        return from(callable({ code, amountCents })).pipe(map((r) => r.data));
    }

    /** `registerGiftCardBatch` (Function, admin, prompt §13): un lote, todo o nada. */
    registerGiftCardBatch(
        amountCents: number,
        codes: string[],
    ): Observable<{ cardCodes: string[] }> {
        const callable = httpsCallable<
            { amountCents: number; codes: string[] },
            { cardCodes: string[] }
        >(this.functions, 'registerGiftCardBatch');
        return from(callable({ amountCents, codes })).pipe(map((r) => r.data));
    }

    /**
     * `registerGiftCard` en modo `'generated'` (Function, admin — ajuste
     * posterior a la Fase 6): el servidor decide el código (`GC-{secuencia
     * global}`, independiente del monto — plan §16.13), atómico dentro de la
     * misma transacción que crea la tarjeta. No toca `registerGiftCard(code, ...)`
     * de arriba — ese sigue siendo exactamente el modo manual de siempre.
     */
    generateGiftCard(amountCents: number): Observable<{ cardCode: string }> {
        const callable = httpsCallable<
            { amountCents: number; codeMode: 'generated' },
            { cardCode: string }
        >(this.functions, 'registerGiftCard');
        return from(callable({ amountCents, codeMode: 'generated' })).pipe(map((r) => r.data));
    }

    /**
     * `registerGiftCardBatch` en modo `'generated'`: `quantity` códigos
     * nuevos y únicos de una denominación, todo o nada — mismas garantías
     * que el lote manual de arriba.
     */
    generateGiftCardBatch(
        amountCents: number,
        quantity: number,
    ): Observable<{ cardCodes: string[] }> {
        const callable = httpsCallable<
            { amountCents: number; codeMode: 'generated'; quantity: number },
            { cardCodes: string[] }
        >(this.functions, 'registerGiftCardBatch');
        return from(callable({ amountCents, codeMode: 'generated', quantity })).pipe(
            map((r) => r.data),
        );
    }

    /** `activateGiftCard` (Function, staff, prompt §10): AVAILABLE → ACTIVE, ciclo nuevo. */
    activateGiftCard(
        input: ActivateGiftCardInput,
    ): Observable<{ cardCode: string; cycleId: string; cycleNumber: number }> {
        const callable = httpsCallable<
            ActivateGiftCardInput,
            { cardCode: string; cycleId: string; cycleNumber: number }
        >(this.functions, 'activateGiftCard');
        return from(callable(input)).pipe(map((r) => r.data));
    }

    /** `suspendGiftCard` (Function, staff, prompt §11): ACTIVE → SUSPENDED. */
    suspendGiftCard(code: string, reason: string): Observable<{ cardCode: string }> {
        const callable = httpsCallable<{ code: string; reason: string }, { cardCode: string }>(
            this.functions,
            'suspendGiftCard',
        );
        return from(callable({ code, reason })).pipe(map((r) => r.data));
    }

    /** `reactivateGiftCard` (Function, staff, prompt §11): SUSPENDED → ACTIVE, mismo ciclo. */
    reactivateGiftCard(code: string): Observable<{ cardCode: string }> {
        const callable = httpsCallable<{ code: string }, { cardCode: string }>(
            this.functions,
            'reactivateGiftCard',
        );
        return from(callable({ code })).pipe(map((r) => r.data));
    }

    /** `cancelGiftCard` (Function, solo admin, prompt §12): baja definitiva, terminal. */
    cancelGiftCard(code: string, reason: string): Observable<{ cardCode: string }> {
        const callable = httpsCallable<{ code: string; reason: string }, { cardCode: string }>(
            this.functions,
            'cancelGiftCard',
        );
        return from(callable({ code, reason })).pipe(map((r) => r.data));
    }

    /**
     * `updateGiftCardAmount` (Function, solo admin — ajuste posterior,
     * identidad ≠ monto): cambia el monto configurado, solo mientras la
     * tarjeta está `AVAILABLE`.
     */
    updateGiftCardAmount(
        code: string,
        amountCents: number,
    ): Observable<{ cardCode: string; amountCents: number }> {
        const callable = httpsCallable<
            { code: string; amountCents: number },
            { cardCode: string; amountCents: number }
        >(this.functions, 'updateGiftCardAmount');
        return from(callable({ code, amountCents })).pipe(map((r) => r.data));
    }

    /**
     * `replaceGiftCard` (Function, solo admin — ajuste posterior): reemplaza
     * el plástico de una tarjeta dañada/perdida, transfiriendo su valor ya
     * pagado SIN volver a cobrar. `options.mode` decide el destino:
     * `'generate'` (default — sin `mode`, el callable manda `undefined`, que
     * la Function trata exactamente igual) genera un código nuevo;
     * `'existing'` reutiliza una Gift Card `AVAILABLE` ya registrada
     * (`options.targetCode`, obligatorio en ese modo).
     */
    replaceGiftCard(
        code: string,
        options: { reason?: string; mode?: GiftCardReplaceMode; targetCode?: string } = {},
    ): Observable<{ cardCode: string; newCardCode: string; amountCents: number }> {
        const callable = httpsCallable<
            { code: string; reason?: string; mode?: GiftCardReplaceMode; targetCode?: string },
            { cardCode: string; newCardCode: string; amountCents: number }
        >(this.functions, 'replaceGiftCard');
        return from(
            callable({
                code,
                reason: options.reason,
                mode: options.mode,
                targetCode: options.targetCode,
            }),
        ).pipe(map((r) => r.data));
    }
}
