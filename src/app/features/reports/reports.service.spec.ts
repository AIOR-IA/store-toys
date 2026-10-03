import { DailySummary } from './daily-summary.model';
import { mergeDailySummaries, receivedTotals } from './reports.service';

/**
 * Regla de negocio: una Gift Card es INGRESO cuando SE VENDE (emisión), no
 * cuando se canjea. Cobros reales = (cash+qr de VENTAS) + (cash+qr de EMISIONES).
 * `giftCardCents` (aplicada) y `giftCardForfeitedCents` (sobrante) nunca suman.
 *
 * Los resúmenes de aquí son EXACTAMENTE lo que escriben `createSale` (probado en
 * `tests/functions/sales.harness.js`) y `activateGiftCard`.
 */
describe('receivedTotals — Gift Card como ingreso al venderse', () => {
    const summary = (o: Partial<DailySummary>): DailySummary =>
        ({
            dateKey: '2026-09-01',
            monthKey: '2026-09',
            year: 2026,
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
            ...o,
        }) as DailySummary;
    const bs = (n: number) => n * 100;
    const totalsOf = (...days: Partial<DailySummary>[]) => receivedTotals(mergeDailySummaries(days.map(summary)));

    it('1. Emisión de Bs 1.000 pagada en efectivo → +1.000 de efectivo ese día', () => {
        const r = totalsOf({ giftCardsIssuedCents: bs(1000), giftCardIssuesCashCents: bs(1000) });
        expect(r).toEqual({ cashCents: bs(1000), qrCents: 0, totalCents: bs(1000) });
    });

    it('2. Emisión de Bs 1.000 pagada por QR → +1.000 de QR', () => {
        const r = totalsOf({ giftCardsIssuedCents: bs(1000), giftCardIssuesQrCents: bs(1000) });
        expect(r).toEqual({ cashCents: 0, qrCents: bs(1000), totalCents: bs(1000) });
    });

    it('3. Canje exacto (compra 1.000 con GC 1.000) → mercadería 1.000, entrada nueva 0', () => {
        const r = totalsOf({ salesCount: 1, totalCents: bs(1000), giftCardCents: bs(1000) });
        expect(r.totalCents).toBe(0);
    });

    it('4. Canje menor (compra 700 con GC 1.000): el sobrante 300 NO es ingreso', () => {
        const r = totalsOf({ salesCount: 1, totalCents: bs(700), giftCardCents: bs(700), giftCardForfeitedCents: bs(300) });
        expect(r).toEqual({ cashCents: 0, qrCents: 0, totalCents: 0 });
    });

    it('5–6. Canje mayor (1.080 = GC 1.000 + 80): la diferencia en efectivo / QR sí entra, la GC no', () => {
        expect(totalsOf({ totalCents: bs(1080), giftCardCents: bs(1000), cashCents: bs(80) })).toEqual({
            cashCents: bs(80),
            qrCents: 0,
            totalCents: bs(80),
        });
        expect(totalsOf({ totalCents: bs(1080), giftCardCents: bs(1000), qrCents: bs(80) })).toEqual({
            cashCents: 0,
            qrCents: bs(80),
            totalCents: bs(80),
        });
    });

    it('7. Rebaja 30 sobre 1.080 → total 1.050 = GC 1.000 + efectivo 50: entra solo 50', () => {
        const r = totalsOf({ totalCents: bs(1050), discountCents: bs(30), giftCardCents: bs(1000), cashCents: bs(50) });
        expect(r.totalCents).toBe(bs(50));
    });

    it('8. Subtotal 800, rebaja 100, total 700, GC 1.000 → entrada nueva 0 (los 300 no se suman)', () => {
        const r = totalsOf({
            totalCents: bs(700),
            discountCents: bs(100),
            giftCardCents: bs(700),
            giftCardForfeitedCents: bs(300),
        });
        expect(r.totalCents).toBe(0);
    });

    it('9. Día con emisiones y sin canjes → el ingreso ya incluye las emisiones', () => {
        const r = totalsOf({
            giftCardsIssuedCents: bs(2500),
            giftCardIssuesCashCents: bs(1500),
            giftCardIssuesQrCents: bs(1000),
        });
        expect(r).toEqual({ cashCents: bs(1500), qrCents: bs(1000), totalCents: bs(2500) });
    });

    it('10. Día con canjes y sin emisiones → «Gift Card aplicada» aparece pero no crea ingreso', () => {
        const merged = mergeDailySummaries([summary({ totalCents: bs(1000), giftCardCents: bs(1000) })]);
        expect(merged.giftCardCents).toBe(bs(1000));
        expect(receivedTotals(merged).totalCents).toBe(0);
    });

    it('11. Día mixto (ejemplo del negocio): 2.880 vendidos, 3.580 efectivo, 1.800 QR, 5.380 cobros', () => {
        // Directo: efectivo 500 + QR 300. Canje exacto 1.000 con GC. Canje 1.080 = GC 1.000 + efectivo 80.
        // Emisiones: efectivo 3.000 + QR 1.500.
        const merged = mergeDailySummaries([
            summary({
                salesCount: 4,
                totalCents: bs(500 + 300 + 1000 + 1080),
                cashCents: bs(500 + 80),
                qrCents: bs(300),
                giftCardCents: bs(1000 + 1000),
                giftCardsIssuedCents: bs(4500),
                giftCardIssuesCashCents: bs(3000),
                giftCardIssuesQrCents: bs(1500),
            }),
        ]);
        const r = receivedTotals(merged);

        expect(merged.totalCents).toBe(bs(2880)); // ventas de mercadería
        expect(r.cashCents).toBe(bs(3580));
        expect(r.qrCents).toBe(bs(1800));
        expect(r.totalCents).toBe(bs(5380)); // cobros reales
        expect(merged.giftCardsIssuedCents).toBe(bs(4500)); // Gift Cards vendidas
        expect(merged.giftCardCents).toBe(bs(2000)); // Gift Card aplicada
        // Identidades: mercancía = Σ pagos de las ventas; cobros = (cash+qr ventas) + (cash+qr emisiones)
        expect(merged.totalCents).toBe(merged.cashCents + merged.qrCents + merged.giftCardCents);
        expect(r.totalCents).toBe(merged.cashCents + merged.qrCents + merged.giftCardIssuesCashCents + merged.giftCardIssuesQrCents);
        // Mercadería vendida ≠ dinero recibido: son magnitudes distintas.
        expect(merged.totalCents).not.toBe(r.totalCents);
    });

    it('acumula varios días sumando los cobros de cada uno (y el sobrante nunca)', () => {
        const r = totalsOf(
            { cashCents: bs(100), giftCardIssuesCashCents: bs(500) },
            { qrCents: bs(50), giftCardIssuesQrCents: bs(200), giftCardForfeitedCents: bs(300) },
        );
        expect(r).toEqual({ cashCents: bs(600), qrCents: bs(250), totalCents: bs(850) });
    });
});
