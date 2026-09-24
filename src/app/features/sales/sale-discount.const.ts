/**
 * Rebajas fijas permitidas sobre el total de una venta (Ajuste de Ventas,
 * obs. 1), en centavos (plan §17.1). Lista CERRADA: no hay importe libre, y
 * `MAX_SALE_DISCOUNT_CENTS` (Bs 30) es el máximo absoluto por venta, no por
 * producto.
 *
 * Solo limita las opciones de la interfaz: la validación real es la de
 * `createSale` (`functions/src/sale-discount.ts`, que espeja esta lista).
 */
export const SALE_DISCOUNT_OPTIONS_CENTS: readonly number[] = [0, 500, 1000, 1500, 2000, 2500, 3000];

export const MAX_SALE_DISCOUNT_CENTS = 3000;

/**
 * ¿Es aplicable esta rebaja a este subtotal? Se permite `0` siempre; una
 * rebaja mayor a cero solo si es de la lista y deja la venta con total > 0
 * (`discount < subtotal`, la misma condición que aplica el servidor).
 */
export function isDiscountApplicable(discountCents: number, subtotalCents: number): boolean {
    if (discountCents === 0) return true;
    return SALE_DISCOUNT_OPTIONS_CENTS.includes(discountCents) && discountCents < subtotalCents;
}
