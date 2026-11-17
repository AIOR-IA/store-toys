import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';

/**
 * `dailySellerSummaries/{dateKey}_{sellerId}` — resumen de caja (efectivo/QR)
 * de UN vendedor en UN día, escrito EN LA MISMA transacción que ya mueve el
 * dinero real (`createSale`/`cancelSale`/`activateGiftCard`/`topUpGiftCard`),
 * nunca en una llamada aparte — write-time aggregation, igual que
 * `dailySummaries` (plan §19.2), pero particionado por vendedor para que
 * `getSellerCashbox` resuelva "caja de Mariela el 17/11" con UNA sola lectura
 * de documento en vez de 3 agregaciones sobre `sales`/`giftCardIssues`/
 * `giftCardTopUps`.
 *
 * Representa exactamente DINERO NUEVO cobrado por ese vendedor: cash/QR de
 * ventas (incluido el complemento de un pago mixto o de Gift Card+efectivo/QR,
 * nunca `giftCardCents` aplicado), cash/QR de activaciones (payments[] de la
 * emisión, nunca un `origin: 'replacement'`) y cash/QR de recargas. El ID
 * determinista (`${dateKey}_${sellerId}`) usa el UID de Firebase Auth —
 * nunca el nombre — que son los caracteres que ya usan como ID de documento
 * en todo el proyecto (`users/{uid}`): seguros para un path de Firestore.
 *
 * Mismo motivo que `dailySummaries` para NUNCA usar `FieldValue.increment()`
 * en los campos de dinero: puede degradar a `doubleValue` cuando el valor base
 * es exactamente `0` (caso real ya documentado en `sales.ts`). Se lee dentro
 * de la misma transacción, se suma en JavaScript como entero, se verifica y
 * se escribe como literal.
 */
export function dailySellerSummaryRef(dateKey: string, sellerId: string) {
    return db.doc(`dailySellerSummaries/${dateKey}_${sellerId}`);
}

function assertSafeIntegerCents(value: number, field: string): number {
    if (!Number.isSafeInteger(value)) {
        throw new HttpsError('internal', `Error interno de cálculo monetario en "${field}". Intenta nuevamente.`);
    }
    return value;
}

export interface SellerSummaryDelta {
    dateKey: string;
    sellerId: string;
    sellerName: string;
    cashDeltaCents: number;
    qrDeltaCents: number;
}

/**
 * Aplica el delta (positivo en `createSale`/activaciones/recargas, negativo
 * en `cancelSale`) sobre el documento ya leído (`tx.get(ref)`, ANTES de
 * cualquier escritura de la transacción — mismo requisito de Firestore que
 * ya respeta `dailySummaries`). `snap` es ese mismo read.
 */
export function applySellerSummaryDelta(
    tx: FirebaseFirestore.Transaction,
    ref: FirebaseFirestore.DocumentReference,
    snap: FirebaseFirestore.DocumentSnapshot,
    delta: SellerSummaryDelta,
): void {
    const cashCents = assertSafeIntegerCents(
        ((snap.exists ? (snap.get('cashCents') as number) : 0) ?? 0) + delta.cashDeltaCents,
        'dailySellerSummaries.cashCents',
    );
    const qrCents = assertSafeIntegerCents(
        ((snap.exists ? (snap.get('qrCents') as number) : 0) ?? 0) + delta.qrDeltaCents,
        'dailySellerSummaries.qrCents',
    );

    if (!snap.exists) {
        tx.create(ref, {
            dateKey: delta.dateKey,
            sellerId: delta.sellerId,
            sellerName: delta.sellerName,
            cashCents,
            qrCents,
            updatedAt: FieldValue.serverTimestamp(),
        });
        return;
    }
    tx.update(ref, {
        sellerName: delta.sellerName,
        cashCents,
        qrCents,
        updatedAt: FieldValue.serverTimestamp(),
    });
}
