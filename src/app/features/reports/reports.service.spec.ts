import { DailySummary } from './daily-summary.model';
import { buildTopConcepts, mergeDailySummaries, receivedTotals } from './reports.service';

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
            giftCardTopUpsCents: 0,
            giftCardTopUpsCashCents: 0,
            giftCardTopUpsQrCents: 0,
            products: {},
            extras: {},
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

    /**
     * Rediseño del PDF ejecutivo (plan §18.4): `extras` es simétrico a
     * `products` dentro de `mergeDailySummaries` — mismo nombre normalizado
     * puede venir de días distintos y debe fundirse en una sola entrada.
     */
    it('12. mergeDailySummaries acumula "extras" de varios días por clave normalizada, igual que "products"', () => {
        const merged = mergeDailySummaries(
            [
                summary({ extras: { chocolate: { name: 'Chocolate', qty: 2, totalCents: bs(20) } } }),
                summary({ extras: { chocolate: { name: 'Chocolate', qty: 3, totalCents: bs(30) } } }),
                summary({ extras: { envoltura: { name: 'Envoltura', qty: 1, totalCents: bs(5) } } }),
            ].map((s) => s as unknown as DailySummary),
        );
        expect(merged.extras['chocolate']).toEqual({ name: 'Chocolate', qty: 5, totalCents: bs(50) });
        expect(merged.extras['envoltura']).toEqual({ name: 'Envoltura', qty: 1, totalCents: bs(5) });
    });

    it('13. un resumen histórico sin "extras" en absoluto se funde como si tuviera {} (backward compatibility)', () => {
        const legacy = { ...summary({}) } as Partial<DailySummary>;
        delete (legacy as { extras?: unknown }).extras;
        const merged = mergeDailySummaries([legacy as DailySummary]);
        expect(merged.extras).toEqual({});
    });
});

/**
 * Recargas de Gift Card integradas a Reportes (Fase F, plan §18.6): dinero
 * NUEVO que entra a caja sobre un ciclo YA abierto — mismo criterio que una
 * emisión, nunca mercadería, nunca se mezcla con `giftCardCents` (saldo
 * CONSUMIDO). `dailySummaries.giftCardTopUpsCents`/`CashCents`/`QrCents` ya
 * los escribe `topUpGiftCard` (Fase C) dentro de la misma transacción —
 * Reportes solo los agrega, SIN consultar `giftCardTopUps` (Rules cerradas)
 * ni tocar Functions.
 */
describe('receivedTotals/mergeDailySummaries — recargas de Gift Card (Fase F, plan §18.6)', () => {
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
            giftCardTopUpsCents: 0,
            giftCardTopUpsCashCents: 0,
            giftCardTopUpsQrCents: 0,
            products: {},
            extras: {},
            ...o,
        }) as DailySummary;
    const bs = (n: number) => n * 100;

    it('F2. mergeDailySummaries suma giftCardTopUpsCents de varios días', () => {
        const merged = mergeDailySummaries([
            summary({ giftCardTopUpsCents: bs(50) }),
            summary({ giftCardTopUpsCents: bs(30) }),
        ]);
        expect(merged.giftCardTopUpsCents).toBe(bs(80));
    });

    it('F3. mergeDailySummaries suma giftCardTopUpsCashCents de varios días', () => {
        const merged = mergeDailySummaries([
            summary({ giftCardTopUpsCashCents: bs(20) }),
            summary({ giftCardTopUpsCashCents: bs(30) }),
        ]);
        expect(merged.giftCardTopUpsCashCents).toBe(bs(50));
    });

    it('F4. mergeDailySummaries suma giftCardTopUpsQrCents de varios días', () => {
        const merged = mergeDailySummaries([
            summary({ giftCardTopUpsQrCents: bs(10) }),
            summary({ giftCardTopUpsQrCents: bs(15) }),
        ]);
        expect(merged.giftCardTopUpsQrCents).toBe(bs(25));
    });

    it('F5. receivedTotals: el efectivo recibido incluye el efectivo de recargas', () => {
        const merged = mergeDailySummaries([summary({ cashCents: bs(100), giftCardTopUpsCashCents: bs(50) })]);
        expect(receivedTotals(merged).cashCents).toBe(bs(150));
    });

    it('F6. receivedTotals: el QR recibido incluye el QR de recargas', () => {
        const merged = mergeDailySummaries([summary({ qrCents: bs(100), giftCardTopUpsQrCents: bs(25) })]);
        expect(receivedTotals(merged).qrCents).toBe(bs(125));
    });

    it('F7. moneyReceived = ventas + activaciones + recargas, las tres fuentes de dinero nuevo juntas', () => {
        const merged = mergeDailySummaries([
            summary({
                cashCents: bs(100),
                qrCents: bs(100),
                giftCardIssuesCashCents: bs(200),
                giftCardIssuesQrCents: bs(100),
                giftCardTopUpsCashCents: bs(50),
                giftCardTopUpsQrCents: bs(25),
            }),
        ]);
        const r = receivedTotals(merged);
        expect(r.cashCents).toBe(bs(350));
        expect(r.qrCents).toBe(bs(225));
        expect(r.totalCents).toBe(bs(575));
    });

    it('F8. Gift Card APLICADA (giftCardCents) nunca entra a moneyReceived, aunque haya recargas en el mismo día', () => {
        const merged = mergeDailySummaries([
            summary({
                totalCents: bs(300),
                giftCardCents: bs(100), // aplicada: consumo de saldo ya pagado antes
                cashCents: bs(200),
                giftCardsIssuedCents: bs(200),
                giftCardIssuesCashCents: bs(200),
                giftCardTopUpsCashCents: bs(50),
            }),
        ]);
        const r = receivedTotals(merged);
        // 200 (venta) + 200 (activación) + 50 (recarga) = 450 — los 100 de la aplicada NUNCA se suman otra vez.
        expect(r.totalCents).toBe(bs(450));
        expect(r.totalCents).not.toBe(bs(550));
    });

    it('F9. el total vendido en mercadería/extras (totalCents) nunca incluye recargas', () => {
        const merged = mergeDailySummaries([
            summary({ totalCents: bs(300), cashCents: bs(300), giftCardTopUpsCashCents: bs(9999) }),
        ]);
        expect(merged.totalCents).toBe(bs(300));
    });

    /**
     * F21/punto 21 del pedido — ejemplo financiero explícito: ventas cash 100
     * + QR 100, Gift Card aplicada 100 (no suma), activación cash 200 + QR
     * 100, recarga cash 50 + QR 25 → efectivo 350, QR 225, total 575. NUNCA
     * 675 (que sería sumar la Gift Card aplicada otra vez).
     */
    it('F21. ejemplo financiero del pedido: cash 350 + QR 225 = 575 Bs, nunca 675', () => {
        const merged = mergeDailySummaries([
            summary({
                totalCents: bs(300), // 100 ventas directas + 100 canjeado con GC + ... (mercadería, no es foco de este test)
                cashCents: bs(100),
                qrCents: bs(100),
                giftCardCents: bs(100),
                giftCardsIssuedCents: bs(300),
                giftCardIssuesCashCents: bs(200),
                giftCardIssuesQrCents: bs(100),
                giftCardTopUpsCashCents: bs(50),
                giftCardTopUpsQrCents: bs(25),
            }),
        ]);
        const r = receivedTotals(merged);
        expect(r.cashCents).toBe(bs(350));
        expect(r.qrCents).toBe(bs(225));
        expect(r.totalCents).toBe(bs(575));
        expect(r.totalCents).not.toBe(bs(675));
    });

    it('F19. un día sin ninguna recarga (todo en 0) sigue funcionando exactamente igual que antes de esta fase', () => {
        const merged = mergeDailySummaries([
            summary({ cashCents: bs(100), qrCents: bs(50), giftCardIssuesCashCents: bs(200) }),
        ]);
        expect(merged.giftCardTopUpsCents).toBe(0);
        expect(merged.giftCardTopUpsCashCents).toBe(0);
        expect(merged.giftCardTopUpsQrCents).toBe(0);
        expect(receivedTotals(merged)).toEqual({ cashCents: bs(300), qrCents: bs(50), totalCents: bs(350) });
    });
});

/**
 * Tabla agregada de conceptos (rediseño del PDF ejecutivo, plan §18.4):
 * Products + Extras en una sola lista, cada uno con su `type`, nunca
 * mezclados en el MISMO objeto (un Extra no tiene `code`).
 */
describe('buildTopConcepts — tabla agregada Products + Extras', () => {
    it('combina products y extras, cada uno con su tipo, y ordena por total descendente', () => {
        const concepts = buildTopConcepts({
            products: { bear: { code: 'MP000010', name: 'Oso peluche', qty: 37, totalCents: 277500 } },
            extras: {
                chocolate: { name: 'Chocolate', qty: 82, totalCents: 82000 },
                envoltura: { name: 'Envoltura regalo', qty: 14, totalCents: 7000 },
            },
        });
        expect(concepts).toEqual([
            { type: 'PRODUCT', code: 'MP000010', name: 'Oso peluche', qty: 37, totalCents: 277500 },
            { type: 'EXTRA', name: 'Chocolate', qty: 82, totalCents: 82000 },
            { type: 'EXTRA', name: 'Envoltura regalo', qty: 14, totalCents: 7000 },
        ]);
    });

    it('un Extra nunca aparece con "code": solo los PRODUCT lo tienen', () => {
        const concepts = buildTopConcepts({ products: {}, extras: { x: { name: 'X', qty: 1, totalCents: 100 } } });
        expect(concepts[0].code).toBeUndefined();
    });

    it('sin products ni extras: lista vacía', () => {
        expect(buildTopConcepts({ products: {}, extras: {} })).toEqual([]);
    });
});
