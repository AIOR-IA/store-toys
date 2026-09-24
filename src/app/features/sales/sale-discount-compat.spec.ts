import { DailySummary } from '../reports/daily-summary.model';
import { dailySummaryConverter } from '../reports/daily-summary.converter';
import { mergeDailySummaries } from '../reports/reports.service';
import { isDiscountApplicable } from './sale-discount.const';
import { saleConverter } from './sale.converter';

/**
 * Compatibilidad con documentos ANTERIORES al ajuste de rebaja: sin migración,
 * una venta o un resumen sin los campos nuevos se leen como "sin rebaja".
 */
const snapshot = (data: Record<string, unknown>, id = 'doc1') =>
    ({ id, data: () => data }) as unknown as Parameters<typeof saleConverter.fromFirestore>[0];

describe('rebaja — compatibilidad con datos históricos', () => {
    it('una venta antigua (sin subtotalCents/discountCents) se lee sin rebaja y con su total histórico', () => {
        const sale = saleConverter.fromFirestore(snapshot({ totalCents: 12345, status: 'completed' }));
        expect(sale.id).toBe('doc1');
        expect(sale.subtotalCents).toBe(12345);
        expect(sale.discountCents).toBe(0);
        expect(sale.totalCents).toBe(12345);
    });

    it('una venta con rebaja conserva sus tres valores tal cual', () => {
        const sale = saleConverter.fromFirestore(
            snapshot({ subtotalCents: 97000, discountCents: 2000, totalCents: 95000 }),
        );
        expect([sale.subtotalCents, sale.discountCents, sale.totalCents]).toEqual([97000, 2000, 95000]);
    });

    it('un dailySummary antiguo se lee con discountCents = 0', () => {
        const summary = dailySummaryConverter.fromFirestore(snapshot({ totalCents: 500, cashCents: 500 }));
        expect(summary.discountCents).toBe(0);
    });

    it('mergeDailySummaries suma rebajas y mezcla días con y sin el campo sin producir NaN', () => {
        const day = (totalCents: number, discountCents: number) =>
            dailySummaryConverter.fromFirestore(
                snapshot({
                    totalCents,
                    discountCents: discountCents || undefined,
                    salesCount: 1,
                    itemsCount: 1,
                    cashCents: totalCents,
                    qrCents: 0,
                    giftCardCents: 0,
                    giftCardsIssuedCents: 0,
                    giftCardForfeitedCents: 0,
                    products: {},
                }),
            ) as DailySummary;

        const totals = mergeDailySummaries([day(95000, 2000), day(40000, 0), day(1000, 500)]);
        expect(totals.totalCents).toBe(136000); // neto
        expect(totals.discountCents).toBe(2500);
        expect(totals.totalCents + totals.discountCents).toBe(138500); // bruto, métrica aparte
        expect(totals.cashCents).toBe(136000); // la rebaja NO aumenta los cobros
    });

    it('isDiscountApplicable: solo la lista cerrada y siempre con total > 0', () => {
        expect(isDiscountApplicable(0, 0)).toBeTrue();
        expect(isDiscountApplicable(2000, 97000)).toBeTrue();
        expect(isDiscountApplicable(3500, 97000)).toBeFalse(); // no permitido
        expect(isDiscountApplicable(1234, 97000)).toBeFalse(); // importe libre
        expect(isDiscountApplicable(-500, 97000)).toBeFalse();
        expect(isDiscountApplicable(500, 500)).toBeFalse(); // total cero
        expect(isDiscountApplicable(1000, 500)).toBeFalse(); // total negativo
        expect(isDiscountApplicable(500, 501)).toBeTrue();
    });
});
