import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { dailySummaryConverter } from './daily-summary.converter';

/**
 * Backward compatibility de `dailySummaries` (Fase F, plan §18.6, punto 13
 * del pedido): un resumen histórico anterior a la Fase C (recargas de Gift
 * Card) no tiene `giftCardTopUpsCents`/`CashCents`/`QrCents` en absoluto —
 * el converter debe leerlos como `0`, nunca romper el reporte ni inventar un
 * valor. Mismo criterio defensivo ya usado para `discountCents`/
 * `giftCardIssuesCashCents`/`giftCardIssuesQrCents`/`extras`.
 */
describe('dailySummaryConverter — backward compatibility de recargas de Gift Card (Fase F)', () => {
    const snapOf = (id: string, data: Record<string, unknown>): QueryDocumentSnapshot =>
        ({ id, data: () => data }) as unknown as QueryDocumentSnapshot;

    it('F1. un resumen histórico sin los campos de recarga se lee con los tres en 0', () => {
        const summary = dailySummaryConverter.fromFirestore(
            snapOf('2026-01-15', {
                dateKey: '2026-01-15',
                monthKey: '2026-01',
                year: 2026,
                salesCount: 1,
                itemsCount: 1,
                totalCents: 10000,
                cashCents: 10000,
                qrCents: 0,
                giftCardCents: 0,
                giftCardsIssuedCents: 0,
                giftCardForfeitedCents: 0,
                giftCardIssuesCashCents: 0,
                giftCardIssuesQrCents: 0,
                products: {},
            }),
        );
        expect(summary.giftCardTopUpsCents).toBe(0);
        expect(summary.giftCardTopUpsCashCents).toBe(0);
        expect(summary.giftCardTopUpsQrCents).toBe(0);
    });

    it('un resumen YA con recargas (Fase C en adelante) conserva sus valores reales, sin tocarlos', () => {
        const summary = dailySummaryConverter.fromFirestore(
            snapOf('2026-10-24', {
                dateKey: '2026-10-24',
                monthKey: '2026-10',
                year: 2026,
                salesCount: 0,
                itemsCount: 0,
                totalCents: 0,
                cashCents: 0,
                qrCents: 0,
                giftCardCents: 0,
                giftCardsIssuedCents: 0,
                giftCardForfeitedCents: 0,
                giftCardIssuesCashCents: 0,
                giftCardIssuesQrCents: 0,
                giftCardTopUpsCents: 5000,
                giftCardTopUpsCashCents: 3000,
                giftCardTopUpsQrCents: 2000,
                products: {},
            }),
        );
        expect(summary.giftCardTopUpsCents).toBe(5000);
        expect(summary.giftCardTopUpsCashCents).toBe(3000);
        expect(summary.giftCardTopUpsQrCents).toBe(2000);
    });

    it('dateKey sigue viniendo tal cual del documento, sin tocarlo', () => {
        const summary = dailySummaryConverter.fromFirestore(
            snapOf('2026-01-15', {
                dateKey: '2026-01-15',
                monthKey: '2026-01',
                year: 2026,
                salesCount: 0,
                itemsCount: 0,
                totalCents: 0,
                cashCents: 0,
                qrCents: 0,
                giftCardCents: 0,
                giftCardsIssuedCents: 0,
                giftCardForfeitedCents: 0,
                giftCardIssuesCashCents: 0,
                giftCardIssuesQrCents: 0,
                products: {},
            }),
        );
        expect(summary.dateKey).toBe('2026-01-15');
    });
});
