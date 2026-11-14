import { CurrencyPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, of } from 'rxjs';
import { SettingsService } from '@core/services';
import { ReportPdfData, ReportsPdfService } from './reports-pdf.service';
import { buildSellerBreakdown } from './reports.service';

/** Objeto cuyo valor para cualquier campo es 0 (agregados vacíos). */
const zeros = (): unknown =>
    new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? 0 : undefined) });

/** Como `zeros()`, pero con overrides puntuales — el resto sigue siendo 0 (nunca `undefined`). */
const zerosWith = (overrides: Record<string, number>): unknown =>
    new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? (overrides[k] ?? 0) : undefined) });

describe('ReportsPdfService — top productos', () => {
    it('el PDF muestra el nombre formateado; el dato del reporte no cambia', async () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                {
                    provide: SettingsService,
                    useValue: {
                        getSettings: () =>
                            of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }),
                    },
                },
            ],
        });
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);

        const topConcepts = [
            { type: 'PRODUCT' as const, code: 'MP000001', name: 'Juguete transformer', qty: 2, totalCents: 9000 },
        ];
        const data = {
            fromKey: '2026-09-01',
            toKey: '2026-09-30',
            rangeTotals: zeros(),
            cashReceivedCents: 0,
            qrReceivedCents: 0,
            moneyReceivedCents: 538000,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount: 0,
            topConcepts,
            sellerScope: null,
        } as unknown as ReportPdfData;

        await TestBed.inject(ReportsPdfService).export(data);

        const text = JSON.stringify(doc);
        expect(text).toContain('JUGUETE TRANSFORMER');
        expect(text).not.toContain('Juguete transformer');
        expect(topConcepts[0].name).toBe('Juguete transformer');
    });

    it('Venta Extra: la tabla agregada muestra Products y Extras juntos, cada uno con su Tipo, sin mezclarlos en el ranking', async () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: SettingsService, useValue: { getSettings: () => of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }) } },
            ],
        });
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);
        const topConcepts = [
            { type: 'PRODUCT' as const, code: 'MP000010', name: 'Oso peluche', qty: 37, totalCents: 277500 },
            { type: 'EXTRA' as const, name: 'Chocolate', qty: 82, totalCents: 82000 },
        ];
        const data = {
            fromKey: '2026-09-01',
            toKey: '2026-09-30',
            rangeTotals: zeros(),
            cashReceivedCents: 0,
            qrReceivedCents: 0,
            moneyReceivedCents: 0,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount: 0,
            topConcepts,
            sellerScope: null,
        } as unknown as ReportPdfData;

        await TestBed.inject(ReportsPdfService).export(data);

        const text = JSON.stringify(doc);
        expect(text).toContain('OSO PELUCHE');
        expect(text).toContain('CHOCOLATE');
        expect(text).toContain('concepts.typeProduct');
        expect(text).toContain('concepts.typeExtra');
    });

    it('Bruto vs. neto: con rebaja, el PDF muestra "Venta bruta" / rebaja / total NETO como cifras distintas', async () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: SettingsService, useValue: { getSettings: () => of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }) } },
            ],
        });
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);
        // Producto A 100 + Producto B 100, rebaja 20 → bruto 200, neto 180 (ejemplo del pedido).
        const data = {
            fromKey: '2026-09-01',
            toKey: '2026-09-01',
            rangeTotals: zerosWith({ totalCents: 18000, discountCents: 2000 }),
            cashReceivedCents: 18000,
            qrReceivedCents: 0,
            moneyReceivedCents: 18000,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount: 0,
            topConcepts: [
                { type: 'PRODUCT' as const, code: 'MP000001', name: 'Producto A', qty: 1, totalCents: 10000 },
                { type: 'PRODUCT' as const, code: 'MP000002', name: 'Producto B', qty: 1, totalCents: 10000 },
            ],
            sellerScope: null,
        } as unknown as ReportPdfData;

        await TestBed.inject(ReportsPdfService).export(data);

        const text = JSON.stringify(doc);
        expect(text).toContain('200.00'); // venta bruta: 100 + 100
        expect(text).toContain('180.00'); // total vendido NETO: 200 - 20
        expect(text).toContain('kpis.grossSales');
        expect(text).toContain('kpis.discountApplied');
        // la tabla de conceptos sigue siendo bruto (100 + 100 = 200), nunca repartida para cuadrar con el neto 180.
        expect(text).toContain('concepts.columns.total');
    });

    it('Bruto vs. neto: SIN rebaja, no se imprime la fila "Venta bruta" (bruto == neto, redundante)', async () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: SettingsService, useValue: { getSettings: () => of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }) } },
            ],
        });
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);
        const data = {
            fromKey: '2026-09-01',
            toKey: '2026-09-01',
            rangeTotals: zerosWith({ totalCents: 18000, discountCents: 0 }),
            cashReceivedCents: 18000,
            qrReceivedCents: 0,
            moneyReceivedCents: 18000,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount: 0,
            topConcepts: [],
            sellerScope: null,
        } as unknown as ReportPdfData;

        await TestBed.inject(ReportsPdfService).export(data);

        const text = JSON.stringify(doc);
        expect(text).not.toContain('kpis.grossSales');
    });

    it('i18n: el inventario de Gift Cards usa labels en PLURAL propios del reporte, nunca la clave técnica ni el singular de app.giftCards.status', async () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: SettingsService, useValue: { getSettings: () => of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }) } },
            ],
        });
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation('es', {
            app: {
                giftCards: { status: { available: 'Disponible', active: 'Activa', suspended: 'Suspendida', cancelled: 'Cancelada' } },
                reports: {
                    giftCards: {
                        inventoryLabels: { AVAILABLE: 'Disponibles', ACTIVE: 'Activas', SUSPENDED: 'Suspendidas', CANCELLED: 'Canceladas' },
                    },
                },
            },
        });
        await firstValueFrom(translate.use('es'));
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);
        const data = {
            fromKey: '2026-09-01',
            toKey: '2026-09-01',
            rangeTotals: zeros(),
            cashReceivedCents: 0,
            qrReceivedCents: 0,
            moneyReceivedCents: 0,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: { AVAILABLE: 78, ACTIVE: 2, SUSPENDED: 0, CANCELLED: 0 },
            giftCardsSoldCount: 0,
            topConcepts: [],
            sellerScope: null,
        } as unknown as ReportPdfData;

        await TestBed.inject(ReportsPdfService).export(data);

        const text = JSON.stringify(doc);
        expect(text).toContain('Disponibles: 78');
        expect(text).toContain('Activas: 2');
        expect(text).not.toContain('Disponible: 78'); // nunca el singular del badge de una sola tarjeta
        expect(text).not.toContain('app.giftCards.status');
        expect(text).not.toContain('app.reports.giftCards.inventoryLabels');
    });

    it('muestra los mismos conceptos que la pantalla: Cobros recibidos sí, «Sobrante perdido» no', async () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: SettingsService, useValue: { getSettings: () => of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }) } },
            ],
        });
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);
        const data = {
            fromKey: '2026-09-01',
            toKey: '2026-09-01',
            rangeTotals: zeros(),
            cashReceivedCents: 358000,
            qrReceivedCents: 180000,
            moneyReceivedCents: 538000,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount: 0,
            topConcepts: [],
            sellerScope: null,
        } as unknown as ReportPdfData;

        await TestBed.inject(ReportsPdfService).export(data);

        const text = JSON.stringify(doc);
        for (const key of ['kpis.cashReceived', 'kpis.qrReceived', 'kpis.moneyReceivedTitle', 'kpis.giftCardRedeemed', 'giftCards.soldTitle']) {
            expect(text).toContain(key);
        }
        expect(text).not.toContain('forfeited');
    });

    it('con filtro de vendedor imprime su desglose: Gift Cards vendidas, efectivo/QR de emisiones y cobros recibidos', async () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: SettingsService, useValue: { getSettings: () => of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }) } },
            ],
        });
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);
        const breakdown = buildSellerBreakdown(
            { salesCount: 2, totalCents: 158000, cashCents: 58000, qrCents: 0, giftCardCents: 100000 },
            { issuesCount: 1, nominalCents: 100000, cashCents: 100000, qrCents: 0 },
        );
        const data = {
            fromKey: '2026-09-01',
            toKey: '2026-09-01',
            rangeTotals: zeros(),
            cashReceivedCents: 0,
            qrReceivedCents: 0,
            moneyReceivedCents: 0,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount: 0,
            topConcepts: [],
            sellerScope: { name: 'Vendedor Uno', breakdown },
        } as unknown as ReportPdfData;

        await TestBed.inject(ReportsPdfService).export(data);

        const text = JSON.stringify(doc);
        for (const key of ['bySeller.giftCardsSold', 'bySeller.issuesCash', 'bySeller.issuesQr', 'kpis.cashReceived', 'kpis.moneyReceived']) {
            expect(text).toContain(key);
        }
        expect(text).toContain('1,580.00'); // efectivo y cobros recibidos del vendedor: 500 + 1.000 + 80
    });
});

/**
 * `giftCardsSoldCount: null` (consulta fallida, p. ej. índice todavía no
 * listo) jamás debe imprimirse como si fuera `0` (consulta válida, de
 * verdad cero Gift Cards vendidas) — distinción pedida explícitamente.
 */
describe('ReportsPdfService — giftCardsSoldCount: null (error) vs. 0 (real)', () => {
    const baseData = (giftCardsSoldCount: number | null) =>
        ({
            fromKey: '2026-09-01',
            toKey: '2026-09-01',
            rangeTotals: zeros(),
            cashReceivedCents: 0,
            qrReceivedCents: 0,
            moneyReceivedCents: 0,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount,
            topConcepts: [],
            sellerScope: null,
        }) as unknown as ReportPdfData;

    async function exportAndCapture(data: ReportPdfData): Promise<string> {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: SettingsService, useValue: { getSettings: () => of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }) } },
            ],
        });
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);
        await TestBed.inject(ReportsPdfService).export(data);
        return JSON.stringify(doc);
    }

    it('G. giftCardsSoldCount null (error de consulta) se imprime como "—", nunca como "0"', async () => {
        const text = await exportAndCapture(baseData(null));
        expect(text).toContain('"—"');
        expect(text).not.toMatch(/"text":"0"/);
    });

    it('H. giftCardsSoldCount 0 (cero real, consulta válida) se imprime literalmente como "0"', async () => {
        const text = await exportAndCapture(baseData(0));
        expect(text).toMatch(/"text":"0"/);
        expect(text).not.toContain('"—"');
    });
});
