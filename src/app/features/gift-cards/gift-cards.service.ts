import { Injectable, inject } from '@angular/core';
import {
    Firestore,
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
import { Observable, from, map } from 'rxjs';
import { CursorPager, PageSize } from '@core/data';
import { normalizeGiftCardCode } from '@core/utils';
import { giftCardConverter, giftCardMovementConverter } from './gift-card.converter';
import { GiftCard, GiftCardIssuePayment, GiftCardMovement, GiftCardStatus } from './gift-card.model';

export type GiftCardsFilter = 'all' | GiftCardStatus;

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
}
