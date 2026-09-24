import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Rebaja fija opcional sobre el total de una venta (Ajuste de Ventas, obs. 1).
 *
 * Lista CERRADA de importes, en centavos (plan §17.1): no existe importe libre
 * ni acumulación de rebajas. `30 Bs` es el máximo ABSOLUTO por venta —no por
 * producto—, y se aplica UNA sola vez sobre el subtotal completo.
 *
 * La rebaja NO es un método de pago: nunca entra en `payments[]` ni en
 * `cashCents`/`qrCents`/`giftCardCents`. Por eso es independiente de cómo se
 * pague la venta (efectivo, QR, gift card, o cualquier combinación futura).
 *
 * Este archivo espeja `SALE_DISCOUNT_OPTIONS_CENTS` de
 * `src/app/features/sales/sale-discount.const.ts`. Angular limita las
 * opciones por UX; la validación real es ESTA, en servidor.
 */
export const ALLOWED_DISCOUNT_CENTS: readonly number[] = [0, 500, 1000, 1500, 2000, 2500, 3000];

/**
 * Valida la FORMA del campo `discountCents` del payload. Ausente (`undefined`)
 * equivale a "sin rebaja"; cualquier otra cosa que no sea exactamente uno de
 * los valores permitidos (negativos, decimales, `null`, textos, > Bs 30,
 * importes arbitrarios) se rechaza.
 */
export function parseDiscountCents(value: unknown): number {
    if (value === undefined) return 0;
    if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        !ALLOWED_DISCOUNT_CENTS.includes(value)
    ) {
        throw new HttpsError(
            'invalid-argument',
            'La rebaja no es válida. Solo se permiten Bs 5, 10, 15, 20, 25 o 30.',
        );
    }
    return value;
}

/**
 * Aplica la rebaja al subtotal RECALCULADO en servidor y devuelve el total
 * final. La rebaja nunca puede dejar la venta en cero o negativa: una rebaja
 * mayor o igual al subtotal se rechaza (no se recorta en silencio).
 */
export function applyDiscount(subtotalCents: number, discountCents: number): number {
    if (discountCents > 0 && discountCents >= subtotalCents) {
        throw new HttpsError(
            'failed-precondition',
            'La rebaja no puede ser mayor o igual al subtotal de la venta.',
        );
    }
    return subtotalCents - discountCents;
}
