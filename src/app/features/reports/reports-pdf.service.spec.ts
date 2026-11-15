import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, of } from 'rxjs';
import { SettingsService } from '@core/services';
import { ReportPdfData, ReportsPdfService } from './reports-pdf.service';
import { buildSellerBreakdown } from './reports.service';

// Registra los DATOS del locale 'es' (igual que `app.config.ts`) — no cambia
// el locale por defecto de ningún otro test de este archivo, solo hace que
// la data exista para los tests que SÍ pasan `LOCALE_ID: 'es'` explícito
// (el bloque "cierre final", para reproducir el formato real de la app).
registerLocaleData(localeEs);

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
 * Recargas de Gift Card en el PDF (Fase F, plan §18.6, puntos 6-8, 17 del
 * pedido): bloque Efectivo/QR con la fila "De recargas Gift Card" y un
 * bloque propio "RECARGAS DE GIFT CARD" en la sección de Gift Card —
 * terminología clara, nunca `TOP_UP`/`giftCardTopUpsCents` visibles.
 */
describe('ReportsPdfService — recargas de Gift Card (Fase F)', () => {
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

    const data = (overrides: Record<string, number> = {}): ReportPdfData =>
        ({
            fromKey: '2026-09-01',
            toKey: '2026-09-01',
            rangeTotals: zerosWith({
                cashCents: 10000,
                qrCents: 10000,
                giftCardIssuesCashCents: 20000,
                giftCardIssuesQrCents: 10000,
                giftCardTopUpsCents: 7500,
                giftCardTopUpsCashCents: 5000,
                giftCardTopUpsQrCents: 2500,
                ...overrides,
            }),
            cashReceivedCents: 35000,
            qrReceivedCents: 22500,
            moneyReceivedCents: 57500,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount: 0,
            topConcepts: [],
            sellerScope: null,
        }) as unknown as ReportPdfData;

    it('F10. el PDF muestra el bloque "Recargas de Gift Card" con su título propio', async () => {
        const text = await exportAndCapture(data());
        expect(text).toContain('app.reports.giftCards.topUps.title');
    });

    it('F11. el PDF muestra el monto recargado (nominal)', async () => {
        const text = await exportAndCapture(data());
        expect(text).toContain('app.reports.giftCards.topUps.amount');
        expect(text).toContain('75.00'); // 7500 centavos
    });

    it('F12. el PDF muestra el efectivo cobrado de recargas', async () => {
        const text = await exportAndCapture(data());
        expect(text).toContain('app.reports.giftCards.topUps.cash');
        expect(text).toContain('50.00');
    });

    it('F13. el PDF muestra el QR cobrado de recargas', async () => {
        const text = await exportAndCapture(data());
        expect(text).toContain('app.reports.giftCards.topUps.qr');
        expect(text).toContain('25.00');
    });

    it('F14. el bloque Efectivo incluye la fila "De recargas Gift Card"', async () => {
        const text = await exportAndCapture(data());
        expect(text).toContain('app.reports.cash.fromTopUps');
    });

    it('F15. el bloque QR incluye la fila "De recargas Gift Card"', async () => {
        const text = await exportAndCapture(data());
        expect(text).toContain('app.reports.qr.fromTopUps');
    });

    it('nunca imprime claves técnicas (TOP_UP, giftCardTopUpsCents) como texto visible', async () => {
        const text = await exportAndCapture(data());
        expect(text).not.toContain('"TOP_UP"');
        expect(text).not.toContain('giftCardTopUpsCents');
    });

    it('F19. sin ninguna recarga (todo en 0): el bloque sigue apareciendo, con montos en 0,00 Bs, sin romper nada', async () => {
        const text = await exportAndCapture(
            data({ giftCardTopUpsCents: 0, giftCardTopUpsCashCents: 0, giftCardTopUpsQrCents: 0 }),
        );
        expect(text).toContain('app.reports.giftCards.topUps.title');
        expect(text).toContain('0.00');
    });

    it('F18. el valor final (TOTAL DINERO INGRESADO A CAJA) ya incluye las recargas recibidas', async () => {
        const { doc } = await (async () => {
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
            let captured: unknown;
            spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
                captured = d;
                return { print: () => undefined };
            }) as never);
            await TestBed.inject(ReportsPdfService).export(data());
            return { doc: captured as Record<string, unknown> };
        })();
        const content = doc['content'] as unknown[];
        const closingBlock = content[content.length - 1] as { stack: unknown[] };
        const lastChild = closingBlock.stack[closingBlock.stack.length - 1] as { stack: { text: string }[] };
        // moneyReceivedCents = 57500 centavos = Bs 575.00, pasado explícitamente arriba.
        expect(lastChild.stack[1].text).toContain('575');
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

/**
 * Cierre final (ajuste posterior): el dato financiero principal (TOTAL
 * DINERO INGRESADO A CAJA) debe ser el ÚLTIMO dato importante del PDF, con
 * más jerarquía visual, y el bloque completo debe mantenerse junto en una
 * sola página (`unbreakable`) para que el total nunca quede huérfano.
 */
describe('ReportsPdfService — cierre final: el TOTAL va al final, con jerarquía, y el bloque no se parte', () => {
    async function exportAndCapture(data: ReportPdfData): Promise<{ text: string; doc: Record<string, unknown> }> {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                // Mismo LOCALE_ID que `app.config.ts` ('es') — para que el formato
                // monetario del test refleje exactamente el de la app real (grupo
                // '.', decimal ',', símbolo "Bs" sufijo), no el locale por defecto
                // de Angular (en-US) que usan el resto de tests de este archivo.
                { provide: LOCALE_ID, useValue: 'es' },
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
        return { text: JSON.stringify(doc), doc: doc as Record<string, unknown> };
    }

    // Ejemplo real del pedido: mercadería 140 Bs (toda en efectivo, 0 QR, 0 Gift Card
    // aplicada → identidad "mercancía" cuadra), más una Gift Card vendida por Bs 250
    // (efectivo 25000 / QR 100000) → efectivo recibido 390, QR recibido 1.000, total 1.390.
    const data = (): ReportPdfData =>
        ({
            fromKey: '2026-09-01',
            toKey: '2026-09-01',
            rangeTotals: zerosWith({
                totalCents: 14000,
                cashCents: 14000,
                qrCents: 0,
                giftCardCents: 0,
                giftCardIssuesCashCents: 25000,
                giftCardIssuesQrCents: 100000,
            }),
            cashReceivedCents: 39000,
            qrReceivedCents: 100000,
            moneyReceivedCents: 139000,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardsSoldCount: 0,
            topConcepts: [],
            sellerScope: null,
        }) as unknown as ReportPdfData;

    it('A. el orden dentro del cierre es: detalle (mercadería/efectivo/QR/GC) → consistencia → TOTAL al final', async () => {
        const { text } = await exportAndCapture(data());
        const iMerchandise = text.indexOf('closing.merchandiseNet');
        const iCash = text.indexOf('kpis.cashReceived');
        const iQr = text.indexOf('kpis.qrReceived');
        const iGiftCard = text.indexOf('kpis.giftCardRedeemed');
        const iConsistent = text.indexOf('closing.consistent');
        const iTotal = text.lastIndexOf('closing.totalReceived'); // el del cierre, no uno anterior
        expect([iMerchandise, iCash, iQr, iGiftCard, iConsistent, iTotal].every((i) => i >= 0)).toBeTrue();
        expect(iMerchandise).toBeLessThan(iConsistent);
        expect(iConsistent).toBeLessThan(iTotal);
        expect(iTotal).toBeGreaterThan(iQr);
        expect(iTotal).toBeGreaterThan(iGiftCard);
    });

    it('B. TOTAL DINERO INGRESADO A CAJA es el último nodo del documento (el bloque final del PDF)', async () => {
        const { doc } = await exportAndCapture(data());
        const content = doc['content'] as unknown[];
        const lastNode = content[content.length - 1] as { stack: unknown[] };
        const lastChild = lastNode.stack[lastNode.stack.length - 1] as { stack: { text: string; fontSize: number; bold: boolean }[] };
        const [label, value] = lastChild.stack;
        expect(label.text).toBe('app.reports.closing.totalReceived');
        expect(value.fontSize).toBe(20);
        expect(value.bold).toBeTrue();
        expect(value.text).toBe('1.390,00 Bs'); // el locale 'es' usa espacio irrompible (U+00A0) antes del símbolo
    });

    it('C. el bloque completo del cierre es "unbreakable" (no se parte entre páginas)', async () => {
        const { doc } = await exportAndCapture(data());
        const content = doc['content'] as unknown[];
        const closingBlock = content[content.length - 1] as { unbreakable?: boolean };
        expect(closingBlock.unbreakable).toBeTrue();
    });

    it('D. nunca se usa la palabra "Ganancia" en ningún lado del PDF', async () => {
        const { text } = await exportAndCapture(data());
        expect(text.toLowerCase()).not.toContain('ganancia');
    });

    it('E. la fórmula no cambia: el TOTAL sigue siendo exactamente moneyReceivedCents (efectivo + QR, sin sumar Gift Card aplicada otra vez)', async () => {
        const { doc } = await exportAndCapture(data());
        const content = doc['content'] as unknown[];
        const lastNode = content[content.length - 1] as { stack: unknown[] };
        const lastChild = lastNode.stack[lastNode.stack.length - 1] as { stack: { text: string }[] };
        expect(lastChild.stack[1].text).toBe('1.390,00 Bs'); // 390 + 1.000, nunca +0 de Gift Card otra vez (espacio U+00A0)
    });

    /** Helper: ubica el nodo `{ table, layout }` dentro del stack del cierre. */
    function findClosingTable(doc: Record<string, unknown>): { table: { body: unknown[][] } } {
        const content = doc['content'] as unknown[];
        const closingBlock = content[content.length - 1] as { stack: unknown[] };
        const tableNode = closingBlock.stack.find(
            (n): n is { table: { body: unknown[][] } } => typeof n === 'object' && n !== null && 'table' in n,
        );
        if (!tableNode) throw new Error('No se encontró ninguna tabla dentro del bloque "Resumen final"');
        return tableNode;
    }

    it('F. "Resumen final" contiene una tabla de pdfmake (nunca HTML) con las 4 filas de detalle', async () => {
        const { doc } = await exportAndCapture(data());
        const { table } = findClosingTable(doc);
        expect(table.body.length).toBe(4);
        const labels = table.body.map((row) => (row[0] as string));
        expect(labels).toEqual([
            'app.reports.closing.merchandiseNet',
            'app.reports.kpis.cashReceived',
            'app.reports.kpis.qrReceived',
            'app.reports.kpis.giftCardRedeemed',
        ]);
    });

    it('G. los montos de la tabla siguen siendo exactamente los mismos (mismo formato "es" del resto del PDF)', async () => {
        const { doc } = await exportAndCapture(data());
        const { table } = findClosingTable(doc);
        const amounts = table.body.map((row) => (row[1] as { text: string; alignment: string }).text);
        expect(amounts).toEqual(['140,00 Bs', '390,00 Bs', '1.000,00 Bs', '0,00 Bs']);
        // alineados a la derecha, para que "1.000,00 Bs" no se corte en la columna de monto.
        expect(table.body.every((row) => (row[1] as { alignment: string }).alignment === 'right')).toBeTrue();
    });

    it('H. el TOTAL DINERO INGRESADO A CAJA queda FUERA de la tabla — sigue siendo su propio bloque destacado, al final', async () => {
        const { doc } = await exportAndCapture(data());
        const content = doc['content'] as unknown[];
        const closingBlock = content[content.length - 1] as { stack: unknown[] };
        const tableNode = closingBlock.stack.find((n) => typeof n === 'object' && n !== null && 'table' in n) as {
            table: { body: unknown[][] };
        };
        // el total nunca es una fila de la tabla: sigue habiendo exactamente 4 filas.
        expect(tableNode.table.body.length).toBe(4);
        expect(tableNode.table.body.some((row) => JSON.stringify(row).includes('totalReceived'))).toBeFalse();
        // y el finalKpi (último elemento del stack) tampoco es un nodo de tabla.
        const lastChild = closingBlock.stack[closingBlock.stack.length - 1] as Record<string, unknown>;
        expect('table' in lastChild).toBeFalse();
    });
});
