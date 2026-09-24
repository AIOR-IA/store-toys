import { CurrencyPipe } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '@core/services';
import { fromCents } from '@core/utils';
import { RECEIPT_LOGO_BASE64 } from '../sales/receipt-logo.const';
import { GiftCardStatus } from '../gift-cards/gift-card.model';
import { RangeTotals, SalesAggregateTotals } from './reports.service';

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
    giftCardDenominations: { amountCents: number; count: number }[];
    liabilityCents: number;
    issuesCountInRange: number;
    redemptionsCountInRange: number;
    topProducts: { code: string; name: string; qty: number; totalCents: number }[];
    sellerScope: { name: string; totals: SalesAggregateTotals } | null;
}

/**
 * Exportación a PDF del cierre de caja (Fase 7, plan §18.3: "Exportación:
 * solo PDF. Sin Excel ni CSV" — decisión ya tomada en el plan, no se inventa
 * un CSV nuevo). Mismo patrón declarativo que `SaleReceiptService`
 * (`pdfmake`, hoja carta, `import()` dinámico): solo esta pantalla lo carga.
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

    private buildDocDefinition(data: ReportPdfData, settings: { storeName: string; timezone: string }): unknown {
        const line = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }] };
        const t = data.rangeTotals;
        const generatedAt = new Date().toLocaleString('es-BO', { timeZone: settings.timezone });

        const identitiesOk =
            t.totalCents === t.cashCents + t.qrCents + t.giftCardCents &&
            data.moneyReceivedCents === t.cashCents + t.qrCents + t.giftCardIssuesCashCents + t.giftCardIssuesQrCents;

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

                { text: this.t('kpis.merchandiseSales'), bold: true, margin: [0, 14, 0, 4] as [number, number, number, number] },
                this.row(this.t('kpis.merchandiseSales'), this.money(t.totalCents), true),
                { text: this.t('kpis.netHint'), fontSize: 8, color: 'gray' },
                this.row(this.t('kpis.discountApplied'), this.money(t.discountCents)),
                this.row(this.t('kpis.cashReceived'), this.money(data.cashReceivedCents)),
                this.row(this.t('kpis.qrReceived'), this.money(data.qrReceivedCents)),
                this.row(this.t('kpis.giftCardRedeemed'), this.money(t.giftCardCents)),
                this.row(this.t('kpis.giftCardsIssued'), this.money(t.giftCardsIssuedCents)),
                this.row(this.t('kpis.salesCount'), String(t.salesCount)),
                this.row(this.t('kpis.itemsCount'), String(t.itemsCount)),
                this.row(this.t('breakdown.forfeited'), this.money(t.giftCardForfeitedCents)),

                { ...line, margin: [0, 10, 0, 6] },
                { text: this.t('breakdown.merchandiseTitle'), bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
                ...(t.discountCents > 0
                    ? [
                          this.row(
                              this.t('breakdown.grossMerchandise'),
                              this.money(t.totalCents + t.discountCents),
                          ),
                          this.row(this.t('kpis.discountApplied'), `-${this.money(t.discountCents)}`),
                      ]
                    : []),
                this.row(this.t('kpis.merchandiseSales'), this.money(t.totalCents)),
                this.row(this.translate.instant('app.sales.payment.cash'), this.money(t.cashCents)),
                this.row(this.translate.instant('app.sales.payment.qr'), this.money(t.qrCents)),
                this.row(this.translate.instant('app.sales.payment.giftcard'), this.money(t.giftCardCents)),

                { text: this.t('breakdown.issuesTitle'), bold: true, margin: [0, 10, 0, 4] as [number, number, number, number] },
                this.row(this.t('breakdown.totalNominal'), this.money(t.giftCardsIssuedCents)),
                this.row(this.t('breakdown.collectedCash'), this.money(t.giftCardIssuesCashCents)),
                this.row(this.t('breakdown.collectedQr'), this.money(t.giftCardIssuesQrCents)),

                { ...line, margin: [0, 10, 0, 6] },
                { text: this.t('identities.title'), bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
                {
                    text: identitiesOk ? `✓ ${this.t('identities.ok')}` : `⚠ ${this.t('identities.mismatch')}`,
                    color: identitiesOk ? 'green' : 'red',
                },
                ...(data.integrity
                    ? [
                          {
                              text: data.integrityMismatch
                                  ? `⚠ ${this.t('identities.integrity.mismatch')}`
                                  : `✓ ${this.t('identities.integrity.ok')}`,
                              color: data.integrityMismatch ? 'red' : 'green',
                              margin: [0, 2, 0, 0] as [number, number, number, number],
                          },
                      ]
                    : []),

                { ...line, margin: [0, 10, 0, 6] },
                { text: this.t('giftCards.title'), bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
                this.row(
                    this.t('giftCards.inventoryTitle'),
                    Object.entries(data.giftCardInventory)
                        .map(([status, n]) => `${this.translate.instant(`app.giftCards.status.${status}`)}: ${n}`)
                        .join(' · '),
                ),
                this.row(this.t('giftCards.liabilityTitle'), this.money(data.liabilityCents)),
                this.row(this.t('giftCards.issuesCount'), String(data.issuesCountInRange)),
                this.row(this.t('giftCards.redemptionsCount'), String(data.redemptionsCountInRange)),

                ...(data.sellerScope
                    ? [
                          { ...line, margin: [0, 10, 0, 6] },
                          {
                              text: `${this.t('bySeller.title')} — ${data.sellerScope.name}`,
                              bold: true,
                              margin: [0, 0, 0, 4] as [number, number, number, number],
                          },
                          this.row(this.t('bySeller.salesCount'), String(data.sellerScope.totals.salesCount)),
                          this.row(this.t('bySeller.merchandiseSales'), this.money(data.sellerScope.totals.totalCents)),
                          this.row(this.t('bySeller.cash'), this.money(data.sellerScope.totals.cashCents)),
                          this.row(this.t('bySeller.qr'), this.money(data.sellerScope.totals.qrCents)),
                          this.row(this.t('bySeller.giftCard'), this.money(data.sellerScope.totals.giftCardCents)),
                      ]
                    : []),

                ...(data.topProducts.length
                    ? [
                          { ...line, margin: [0, 10, 0, 6] },
                          { text: this.t('topProducts.title'), bold: true, margin: [0, 0, 0, 2] as [number, number, number, number] },
                          {
                              text: this.t('topProducts.grossNote'),
                              fontSize: 8,
                              color: 'gray',
                              margin: [0, 0, 0, 4] as [number, number, number, number],
                          },
                          {
                              table: {
                                  headerRows: 1,
                                  widths: ['auto', '*', 'auto', 'auto'],
                                  body: [
                                      [
                                          { text: this.t('topProducts.columns.code'), bold: true },
                                          { text: this.t('topProducts.columns.name'), bold: true },
                                          { text: this.t('topProducts.columns.qty'), bold: true, alignment: 'center' },
                                          { text: this.t('topProducts.columns.total'), bold: true, alignment: 'right' },
                                      ],
                                      ...data.topProducts
                                          .slice(0, 20)
                                          .map((p) => [
                                              p.code,
                                              p.name,
                                              { text: String(p.qty), alignment: 'center' },
                                              { text: this.money(p.totalCents), alignment: 'right' },
                                          ]),
                                  ],
                              },
                              layout: 'lightHorizontalLines',
                          },
                      ]
                    : []),
            ],
        };
    }
}
