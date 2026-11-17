import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './admin';
import { assertActive } from './guards';
import { dailySellerSummaryRef } from './daily-seller-summary';

/**
 * `getSellerCashbox` — caja (efectivo/QR) de UN día, para Historial de
 * Ventas (plan §29-ter). Fuente autoritativa en backend: el cliente nunca lee
 * `giftCardIssues`/`giftCardTopUps` ni hace agregaciones — ahora es
 * literalmente **UNA lectura de documento**, gracias al write-time
 * aggregation de `dailySellerSummaries` (ver `daily-seller-summary.ts`),
 * actualizado en la MISMA transacción que `createSale`/`cancelSale`/
 * `activateGiftCard`/`topUpGiftCard`.
 *
 * - vendedor (o admin con `sellerId`): `dailySellerSummaries/{dateKey}_{sellerId}`.
 * - admin SIN `sellerId` (caso "Todos"): `dailySummaries/{dateKey}` — MISMA
 *   fórmula que ya usa Reportes (`receivedTotals` en `reports.service.ts`,
 *   frontend): `cashCents = cashCents + giftCardIssuesCashCents +
 *   giftCardTopUpsCashCents` (ídem QR). No es una definición nueva: es la
 *   única fórmula aprobada de "dinero nuevo recibido", reutilizada tal cual.
 *
 * Seguridad: igual que antes — vendedor SIEMPRE su propio UID (si pide
 * explícitamente otro, `permission-denied`, nunca se ignora en silencio);
 * admin decide (vendedor puntual o "todos").
 *
 * `firestore.rules` no cambia: `dailySellerSummaries` queda tan cerrada al
 * cliente como `giftCardTopUps` siempre lo estuvo — el Admin SDK dentro de
 * esta Function no depende de esas Rules en absoluto.
 */
const REGION = 'southamerica-west1';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface GetSellerCashboxData {
    dateKey: string;
    sellerId?: string;
}

interface SellerCashboxResult {
    cashCents: number;
    qrCents: number;
}

function requireDateKey(value: unknown): string {
    if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) {
        throw new HttpsError('invalid-argument', 'La fecha debe tener el formato YYYY-MM-DD.');
    }
    return value;
}

function optionalSellerId(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string' || !value.trim()) {
        throw new HttpsError('invalid-argument', 'El vendedor informado no es válido.');
    }
    return value;
}

export const getSellerCashbox = onCall<GetSellerCashboxData>({ region: REGION }, async (request) => {
    const staffSnap = await assertActive(request.auth);
    const role = staffSnap.get('role');
    if (role !== 'admin' && role !== 'user') {
        throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }

    const dateKey = requireDateKey(request.data?.dateKey);
    const requestedSellerId = optionalSellerId(request.data?.sellerId);

    let sellerId: string | undefined;
    if (role === 'admin') {
        sellerId = requestedSellerId; // undefined => "todos los vendedores" (dailySummaries global)
    } else {
        if (requestedSellerId !== undefined && requestedSellerId !== request.auth!.uid) {
            throw new HttpsError('permission-denied', 'Solo puedes consultar tu propia caja.');
        }
        sellerId = request.auth!.uid;
    }

    if (sellerId) {
        const snap = await dailySellerSummaryRef(dateKey, sellerId).get();
        const result: SellerCashboxResult = {
            cashCents: (snap.get('cashCents') as number | undefined) ?? 0,
            qrCents: (snap.get('qrCents') as number | undefined) ?? 0,
        };
        return result;
    }

    const snap = await db.doc(`dailySummaries/${dateKey}`).get();
    const result: SellerCashboxResult = {
        cashCents:
            ((snap.get('cashCents') as number | undefined) ?? 0) +
            ((snap.get('giftCardIssuesCashCents') as number | undefined) ?? 0) +
            ((snap.get('giftCardTopUpsCashCents') as number | undefined) ?? 0),
        qrCents:
            ((snap.get('qrCents') as number | undefined) ?? 0) +
            ((snap.get('giftCardIssuesQrCents') as number | undefined) ?? 0) +
            ((snap.get('giftCardTopUpsQrCents') as number | undefined) ?? 0),
    };
    return result;
});
