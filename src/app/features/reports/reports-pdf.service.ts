import { CurrencyPipe } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '@core/services';
import { fromCents } from '@core/utils';
import { formatProductName } from '@shared/utils';
import { RECEIPT_LOGO_BASE64 } from '../sales/receipt-logo.const';
import { GiftCardStatus } from '../gift-cards/gift-card.model';
import { ReportConcept, RangeTotals, SalesAggregateTotals, SellerBreakdown } from './reports.service';

type PdfMake = {
    createPdf: (doc: unknown) => { print: () => void; download: (name: string) => void };
    addVirtualFileSystem: (vfs: unknown) => void;
};

export interface ReportPdfData {
    fromKey: string;
    toKey: string;
    rangeTotals: RangeTotals;
    cashReceivedCents: number;
    qrReceivedCents: number;
    moneyReceivedCents: number;
    integrity: SalesAggregateTotals | null;
    integrityMismatch: boolean;
    giftCardInventory: Record<GiftCardStatus, number>;
    /**
     * Gift Cards vendidas/emitidas en el rango, EXCLUYENDO reemplazos
     * (`ReportsService.getSoldIssuesCountInRange`). `null` = la consulta
     * falló (p. ej. índice compuesto todavía no listo) — NUNCA se imprime
     * como `0`, que significaría "de verdad cero Gift Cards vendidas".
     */
    giftCardsSoldCount: number | null;
    /** Products + Extras agregados (`buildTopConcepts`), nunca por venta ni por unidad. */
    topConcepts: ReportConcept[];
    sellerScope: { name: string; breakdown: SellerBreakdown } | null;
}

/**
 * Exportación a PDF del cierre de caja (Fase 7, plan §18.3, rediseño
 * ejecutivo plan §18.4: "Exportación: solo PDF. Sin Excel ni CSV"). Mismo
 * patrón declarativo que `SaleReceiptService` (`pdfmake`, hoja carta,
 * `import()` dinámico): solo esta pantalla lo carga.
 *
 * Rediseño (plan §18.4): reporte EJECUTIVO y compacto — pocos KPIs grandes,
 * tres bloques por método de pago (Efectivo/QR/Gift Card, solo montos,
 * nunca un reparto inventado para ventas mixtas), una sola tabla agregada
 * de conceptos vendidos (Products + Extras, nunca venta por venta ni unidad
 * por unidad) y un cierre final compacto. Nunca imprime el detalle de una
 * venta ni ningún id/código técnico salvo el código de Product (que sí
 * aporta valor para ubicarlo en el catálogo).
 */
@Injectable({ providedIn: 'root' })
export class ReportsPdfService {
    private readonly settingsService = inject(SettingsService);
    private readonly translate = inject(TranslateService);
    private readonly currencyPipe = inject(CurrencyPipe);

    async export(data: ReportPdfData): Promise<void> {
        const settings = await firstValueFrom(this.settingsService.getSettings());
        const [pdfMakeMod, vfsFontsMod] = await Promise.all([
            import('pdfmake/build/pdfmake'),
            import('pdfmake/build/vfs_fonts'),
        ]);
        const pdfMake = (pdfMakeMod as { default?: PdfMake }).default as PdfMake;
        const vfs = (vfsFontsMod as { default?: unknown }).default ?? vfsFontsMod;
        pdfMake.addVirtualFileSystem(vfs);

        pdfMake.createPdf(this.buildDocDefinition(data, settings)).print();
    }

    private money(cents: number): string {
        return this.currencyPipe.transform(fromCents(cents), 'BOB', 'Bs', '1.2-2') ?? '';
    }

    private t(key: string, params?: Record<string, unknown>): string {
        return this.translate.instant(`app.reports.${key}`, params);
    }

    private row(label: string, value: string, bold = false): unknown {
        return {
            columns: [
                { text: label, width: '*' },
                { text: value, width: 'auto', alignment: 'right', bold },
            ],
            margin: [0, 1, 0, 1] as [number, number, number, number],
        };
    }

    /** KPI grande (Resumen ejecutivo / Cierre final): etiqueta pequeña encima, monto grande en negrita debajo. */
    private bigKpi(label: string, value: string): unknown {
        return {
            stack: [
                { text: label, fontSize: 9, color: 'gray' },
                { text: value, fontSize: 17, bold: true, margin: [0, 0, 0, 2] as [number, number, number, number] },
            ],
            margin: [0, 6, 0, 0] as [number, number, number, number],
        };
    }

    private sectionTitle(text: string): unknown {
        return { text, bold: true, fontSize: 11, margin: [0, 12, 0, 4] as [number, number, number, number] };
    }

    private buildDocDefinition(data: ReportPdfData, settings: { storeName: string; timezone: string }): unknown {
        const line = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }] };
        const t = data.rangeTotals;
        const generatedAt = new Date().toLocaleString('es-BO', { timeZone: settings.timezone });

        // Comprobación de consistencia (plan §18.3, mismas identidades de
        // siempre): se combina en UN solo veredicto — compacta cuando todo
        // cuadra, y solo entonces se detallan las líneas que fallaron.
        const merchandiseOk = t.totalCents === t.cashCents + t.qrCents + t.giftCardCents;
        const integrityOk = !data.integrity || !data.integrityMismatch;
        const allConsistent = merchandiseOk && integrityOk;
        const merchandiseDiffCents = Math.abs(t.totalCents - (t.cashCents + t.qrCents + t.giftCardCents));

        return {
            pageSize: 'LETTER',
            pageMargins: [40, 40, 40, 40],
            defaultStyle: { fontSize: 9 },
            content: [
                {
                    columns: [
                        { image: RECEIPT_LOGO_BASE64, width: 70 },
                        {
                            margin: [10, 0, 0, 0],
                            stack: [
                                { text: settings.storeName, bold: true, fontSize: 13 },
                                { text: this.t('export.title'), fontSize: 11 },
                            ],
                        },
                    ],
                },
                { ...line, margin: [0, 8, 0, 8] },
                {
                    columns: [
                        { text: `${this.t('export.period')}: ${data.fromKey} — ${data.toKey}` },
                        { text: `${this.t('export.generatedAt')}: ${generatedAt}`, alignment: 'right' },
                    ],
                },
                ...(data.sellerScope
                    ? [{ text: `${this.t('export.sellerScope')}: ${data.sellerScope.name}`, margin: [0, 2, 0, 0] }]
                    : []),

                // ---- Resumen ejecutivo ----
                // `t.totalCents` es NETO (después de rebaja); `products`/`extras` guardan
                // el subtotal BRUTO de cada concepto (precio de lista, antes de la rebaja
                // de la venta completa) — por eso, cuando hubo rebajas, se muestra primero
                // la venta bruta y la rebaja, y el NETO queda como el KPI grande.
                ...(t.discountCents > 0
                    ? [
                          this.row(this.t('kpis.grossSales'), this.money(t.totalCents + t.discountCents)),
                          this.row(this.t('kpis.discountApplied'), `-${this.money(t.discountCents)}`),
                      ]
                    : []),
                this.bigKpi(this.t('kpis.totalSoldTitle'), this.money(t.totalCents)),
                this.bigKpi(this.t('kpis.moneyReceivedTitle'), this.money(data.moneyReceivedCents)),
                this.row(this.t('kpis.cashReceived'), this.money(data.cashReceivedCents)),
                this.row(this.t('kpis.qrReceived'), this.money(data.qrReceivedCents)),
                this.row(this.t('kpis.giftCardRedeemed'), this.money(t.giftCardCents)),
                { text: this.t('kpis.giftCardRedeemedHint'), fontSize: 8, color: 'gray' },

                // ---- Efectivo ----
                { ...line, margin: [0, 10, 0, 0] },
                this.sectionTitle(this.t('sections.cash')),
                this.row(this.t('cash.fromSales'), this.money(t.cashCents)),
                this.row(this.t('cash.fromGiftCards'), this.money(t.giftCardIssuesCashCents)),
                this.row(this.t('cash.total'), this.money(data.cashReceivedCents), true),

                // ---- QR ----
                this.sectionTitle(this.t('sections.qr')),
                this.row(this.t('qr.fromSales'), this.money(t.qrCents)),
                this.row(this.t('qr.fromGiftCards'), this.money(t.giftCardIssuesQrCents)),
                this.row(this.t('qr.total'), this.money(data.qrReceivedCents), true),

                // ---- Gift Card ----
                this.sectionTitle(this.t('sections.giftCard')),
                { text: this.t('giftCards.soldTitle'), bold: true, fontSize: 9, margin: [0, 2, 0, 2] as [number, number, number, number] },
                this.row(
                    this.t('giftCards.soldCount'),
                    data.giftCardsSoldCount === null ? '—' : String(data.giftCardsSoldCount),
                ),
                this.row(this.t('breakdown.totalNominal'), this.money(t.giftCardsIssuedCents)),
                this.row(this.t('breakdown.collectedCash'), this.money(t.giftCardIssuesCashCents)),
                this.row(this.t('breakdown.collectedQr'), this.money(t.giftCardIssuesQrCents)),
                {
                    text: this.t('giftCards.appliedTitle'),
                    bold: true,
                    fontSize: 9,
                    margin: [0, 8, 0, 2] as [number, number, number, number],
                },
                this.row(this.t('giftCards.appliedAmount'), this.money(t.giftCardCents), true),
                { text: this.t('kpis.giftCardRedeemedHint'), fontSize: 8, color: 'gray' },
                {
                    text: this.t('giftCards.inventoryTitle'),
                    bold: true,
                    fontSize: 9,
                    margin: [0, 8, 0, 2] as [number, number, number, number],
                },
                {
                    text: Object.entries(data.giftCardInventory)
                        .map(([status, n]) => `${this.t(`giftCards.inventoryLabels.${status}`)}: ${n}`)
                        .join(' · '),
                },

                // ---- Tabla agregada: Productos + Extras ----
                ...(data.topConcepts.length
                    ? [
                          { ...line, margin: [0, 10, 0, 6] },
                          { text: this.t('concepts.title'), bold: true, margin: [0, 0, 0, 2] as [number, number, number, number] },
                          {
                              text: this.t('concepts.grossNote'),
                              fontSize: 8,
                              color: 'gray',
                              margin: [0, 0, 0, 4] as [number, number, number, number],
                          },
                          {
                              table: {
                                  headerRows: 1,
                                  dontBreakRows: true,
                                  widths: ['*', 'auto', 'auto', 'auto'],
                                  body: [
                                      [
                                          { text: this.t('concepts.columns.concept'), bold: true },
                                          { text: this.t('concepts.columns.type'), bold: true },
                                          { text: this.t('concepts.columns.qty'), bold: true, alignment: 'center' },
                                          { text: this.t('concepts.columns.total'), bold: true, alignment: 'right' },
                                      ],
                                      ...data.topConcepts.map((c) => [
                                          formatProductName(c.name),
                                          c.type === 'EXTRA' ? this.t('concepts.typeExtra') : this.t('concepts.typeProduct'),
                                          { text: String(c.qty), alignment: 'center' },
                                          { text: this.money(c.totalCents), alignment: 'right' },
                                      ]),
                                  ],
                              },
                              layout: 'lightHorizontalLines',
                          },
                      ]
                    : []),

                ...(data.sellerScope
                    ? [
                          { ...line, margin: [0, 10, 0, 6] },
                          {
                              text: `${this.t('bySeller.title')} — ${data.sellerScope.name}`,
                              bold: true,
                              margin: [0, 0, 0, 4] as [number, number, number, number],
                          },
                          this.row(this.t('bySeller.salesCount'), String(data.sellerScope.breakdown.salesCount)),
                          this.row(this.t('bySeller.merchandiseSales'), this.money(data.sellerScope.breakdown.merchandiseCents)),
                          this.row(this.t('bySeller.cash'), this.money(data.sellerScope.breakdown.salesCashCents)),
                          this.row(this.t('bySeller.qr'), this.money(data.sellerScope.breakdown.salesQrCents)),
                          this.row(this.t('bySeller.giftCard'), this.money(data.sellerScope.breakdown.giftCardAppliedCents)),
                          this.row(
                              this.t('bySeller.giftCardsSold'),
                              `${this.money(data.sellerScope.breakdown.giftCardsSoldCents)} (${data.sellerScope.breakdown.giftCardsSoldCount})`,
                          ),
                          this.row(this.t('bySeller.issuesCash'), this.money(data.sellerScope.breakdown.issuesCashCents)),
                          this.row(this.t('bySeller.issuesQr'), this.money(data.sellerScope.breakdown.issuesQrCents)),
                          this.row(this.t('kpis.cashReceived'), this.money(data.sellerScope.breakdown.cashReceivedCents)),
                          this.row(this.t('kpis.qrReceived'), this.money(data.sellerScope.breakdown.qrReceivedCents)),
                          this.row(this.t('kpis.moneyReceived'), this.money(data.sellerScope.breakdown.moneyReceivedCents), true),
                      ]
                    : []),

                // ---- Cierre final ----
                { ...line, margin: [0, 10, 0, 6] },
                this.bigKpi(this.t('closing.totalSold'), this.money(t.totalCents)),
                this.bigKpi(this.t('closing.moneyReceived'), this.money(data.moneyReceivedCents)),
                this.row(this.t('closing.cash'), this.money(data.cashReceivedCents)),
                this.row(this.t('closing.qr'), this.money(data.qrReceivedCents)),
                this.row(this.t('closing.giftCardApplied'), this.money(t.giftCardCents)),
                {
                    text: allConsistent ? `✓ ${this.t('closing.consistent')}` : `⚠ ${this.t('closing.inconsistent')}`,
                    color: allConsistent ? 'green' : 'red',
                    bold: true,
                    margin: [0, 6, 0, 0] as [number, number, number, number],
                },
                ...(!merchandiseOk
                    ? [{ text: `⚠ ${this.t('identities.mismatch')} (${this.money(merchandiseDiffCents)})`, color: 'red', fontSize: 8 }]
                    : []),
                ...(data.integrity && data.integrityMismatch
                    ? [{ text: `⚠ ${this.t('identities.integrity.mismatch')}`, color: 'red', fontSize: 8 }]
                    : []),
            ],
        };
    }
}
