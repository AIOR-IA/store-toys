/**
 * Modelo de `dailySummaries/{dateKey}` (plan §8.7, CLAUDE.md "Datos"/"Ventas").
 *
 * Lo escriben `createSale`/`cancelSale` (Fase 4) y
 * `activateGiftCard`/`cancelGiftCard` (Fase 6) — SIEMPRE dentro de la misma
 * transacción que el evento que lo origina. Reportes NUNCA escribe aquí
 * (Rules: `allow write: if false`): solo lee, y solo admin (plan §18.3).
 *
 * La regla financiera fundamental (plan §18.1, §18.2) que separa estos
 * campos: emitir/activar una gift card es dinero NUEVO que entra pero NO es
 * mercancía vendida (`giftCardsIssuedCents`, `giftCardIssuesCashCents`,
 * `giftCardIssuesQrCents`); redimirla es un pago que ya se cobró antes y NO
 * es dinero nuevo (`giftCardCents`, dentro de `totalCents`). Nunca sumar
 * ambos lados como si fueran la misma cosa.
 */
export interface DailySummary {
    dateKey: string; // 'YYYY-MM-DD' en America/La_Paz — también el ID del documento
    monthKey: string; // 'YYYY-MM'
    year: number;

    salesCount: number;
    itemsCount: number; // unidades vendidas
    totalCents: number; // mercancía vendida (ventas `completed`), NETA: después de las rebajas
    /**
     * Rebajas fijas aplicadas a las ventas del día (Ajuste de Ventas, obs. 1).
     * NO son dinero cobrado ni un método de pago: `totalCents` ya viene neto,
     * así que `totalCents + discountCents` es la mercadería BRUTA (a precio de
     * lista) y `totalCents === cashCents + qrCents + giftCardCents` sigue
     * cumpliéndose. Un resumen previo al ajuste no tiene este campo:
     * `dailySummaryConverter` lo lee como 0.
     */
    discountCents: number;
    cashCents: number; // efectivo de VENTAS de mercadería
    qrCents: number; // QR de VENTAS de mercadería
    giftCardCents: number; // saldo de gift card CONSUMIDO en ventas — no es dinero nuevo

    giftCardsIssuedCents: number; // tarjetas nuevas vendidas/activadas (dinero nuevo, pasivo)
    giftCardForfeitedCents: number; // sobrante perdido (compra menor a la denominación)

    // Desglose de CÓMO se cobró la venta/activación de la tarjeta (Fase 6,
    // plan §8.7): separado de cashCents/qrCents porque esos dos son
    // estrictamente "mercancía vendida" — mezclar aquí el dinero de una
    // emisión rompería la identidad `mercancía vendida == Σ pagos de las ventas`.
    giftCardIssuesCashCents: number;
    giftCardIssuesQrCents: number;

    // Detalle por producto del día — solo los que se vendieron. Es la razón
    // de ser de esta colección: `items[]` de una venta no es agregable con
    // `sum()` (plan §8.7, §19). `totalCents` de cada producto es su importe a
    // PRECIO DE LISTA: la rebaja es de la venta completa, no de un artículo,
    // así que Σ products[].totalCents === totalCents + discountCents (bruto).
    products: Record<string, { code: string; name: string; qty: number; totalCents: number }>;
}
