import { CurrencyPipe } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '@core/services';
import { AppSettings } from '@core/models';
import { fromCents } from '@core/utils';
import { formatInStoreTimezone } from '@core/utils/date.util';
import { RECEIPT_LOGO_BASE64 } from './receipt-logo.const';
import { Sale } from './sale.model';

type PdfMake = {
    createPdf: (doc: unknown) => { print: () => void; download: (name: string) => void };
    addVirtualFileSystem: (vfs: unknown) => void;
};

/**
 * Comprobante PDF de una venta (plan §18.4): hoja carta, generado bajo
 * demanda desde los SNAPSHOTS de la venta — nunca vuelve a leer `products`,
 * así que un producto renombrado o repreciado después no cambia un
 * comprobante ya emitido.
 *
 * `pdfmake` se carga con `import()` dinámico, igual que en la hoja de
 * etiquetas de Productos (Fase 3): solo esta pantalla lo necesita.
 */
@Injectable({ providedIn: 'root' })
export class SaleReceiptService {
    private readonly settingsService = inject(SettingsService);
    private readonly translate = inject(TranslateService);
    private readonly currencyPipe = inject(CurrencyPipe);

    async print(sale: Sale): Promise<void> {
        const settings = await firstValueFrom(this.settingsService.getSettings());
        const [pdfMakeMod, vfsFontsMod] = await Promise.all([
            import('pdfmake/build/pdfmake'),
            import('pdfmake/build/vfs_fonts'),
        ]);
        const pdfMake = (pdfMakeMod as { default?: PdfMake }).default as PdfMake;
        const vfs = (vfsFontsMod as { default?: unknown }).default ?? vfsFontsMod;
        pdfMake.addVirtualFileSystem(vfs);

        pdfMake.createPdf(this.buildDocDefinition(sale, settings)).print();
    }

    private money(cents: number): string {
        return this.currencyPipe.transform(fromCents(cents), 'BOB', 'Bs', '1.2-2') ?? '';
    }

    private t(key: string, params?: Record<string, unknown>): string {
        return this.translate.instant(`app.sales.receipt.${key}`, params);
    }

    /**
     * Desglose real de `payments[]` (Fase 6, prompt de corrección de
     * presentación): un pago mixto (gift card + la diferencia) mostraba antes
     * `Pago: Gift Card + Efectivo    <totalCents>` — el total completo junto a
     * los DOS métodos combinados, como si cada uno hubiera cubierto el total
     * entero. Ahora cada método imprime su propio `amountCents` (el mismo
     * snapshot que ya guardó `createSale`, nunca un recálculo) para que el
     * dueño pueda ver de un vistazo cuánto entró por cada forma de pago.
     */
    private buildPaymentRows(sale: Sale): unknown[] {
        return sale.payments.flatMap((payment) => {
            const label = this.translate.instant(`app.sales.payment.${payment.method}`);
            const rows: unknown[] = [
                {
                    columns: [
                        { text: label, width: '*' },
                        { text: this.money(payment.amountCents), width: 'auto', alignment: 'right' },
                    ],
                },
            ];
            if (payment.method === 'giftcard' && payment.giftCardCode) {
                rows.push({
                    text: `${this.t('columns.code')}: ${payment.giftCardCode}`,
                    fontSize: 8,
                    color: 'gray',
                    margin: [0, 0, 0, 2] as [number, number, number, number],
                });
            }
            return rows;
        });
    }

    /**
     * Totales del comprobante. Sin rebaja queda EXACTAMENTE como antes (una
     * sola línea `TOTAL`, sin filas de Bs 0,00 que no aportan nada); con
     * rebaja se muestran subtotal, rebaja y total — los tres persistidos en
     * la venta, nunca recalculados. La rebaja no es un pago: los pagos se
     * imprimen debajo, ya sumando el total final (`buildPaymentRows`).
     */
    private buildTotalsBlock(sale: Sale): unknown {
        if (sale.discountCents <= 0) {
            return {
                margin: [0, 10, 0, 0],
                columns: [
                    { text: '', width: '*' },
                    {
                        width: 'auto',
                        text: `${this.t('total')}    ${this.money(sale.totalCents)}`,
                        bold: true,
                    },
                ],
            };
        }

        const row = (label: string, amount: string, bold = false): unknown => ({
            columns: [
                { text: label, width: '*', bold },
                { text: amount, width: 'auto', alignment: 'right', bold },
            ],
        });
        return {
            margin: [0, 10, 0, 0],
            columns: [
                { text: '', width: '*' },
                {
                    width: 200,
                    stack: [
                        row(this.t('columns.subtotal'), this.money(sale.subtotalCents)),
                        row(
                            this.translate.instant('app.sales.discount.label'),
                            `-${this.money(sale.discountCents)}`,
                        ),
                        row(this.t('total'), this.money(sale.totalCents), true),
                    ],
                },
            ],
        };
    }

    private buildDocDefinition(sale: Sale, settings: AppSettings): unknown {
        const shortId = sale.id.slice(-8).toUpperCase();
        const dateStr = formatInStoreTimezone(sale.createdAt, settings.timezone);
        const line = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }] };

        return {
            pageSize: 'LETTER',
            pageMargins: [40, 40, 40, 40],
            defaultStyle: { fontSize: 9 },
            content: [
                {
                    columns: [
                        { image: RECEIPT_LOGO_BASE64, width: 90 },
                        {
                            margin: [10, 0, 0, 0],
                            stack: [
                                {
                                    text: `${settings.storeName} — ${settings.storeTagline}`,
                                    bold: true,
                                    fontSize: 13,
                                },
                                { text: settings.storeDescription },
                                { text: settings.address },
                                {
                                    text: [
                                        `Tel. ${settings.phone}`,
                                        settings.social ? ` · ${settings.social}` : '',
                                    ].join(''),
                                },
                            ],
                        },
                    ],
                },
                { ...line, margin: [0, 10, 0, 10] },
                {
                    columns: [
                        { text: this.t('title'), bold: true },
                        { text: `${this.t('number')} ${shortId}`, alignment: 'right' },
                    ],
                },
                {
                    columns: [
                        { text: `${this.t('date')}: ${dateStr} (La Paz)` },
                        {
                            text: `${this.t('client')}: ${sale.customerName ?? this.t('anonymous')}`,
                            alignment: 'right',
                        },
                    ],
                    margin: [0, 4, 0, 0],
                },
                {
                    text: `${this.t('servedBy')}: ${sale.sellerName}`,
                    margin: [0, 4, 0, 10],
                },
                line,
                {
                    margin: [0, 10, 0, 10],
                    table: {
                        headerRows: 1,
                        widths: ['auto', '*', 'auto', 'auto', 'auto'],
                        body: [
                            [
                                { text: this.t('columns.code'), bold: true },
                                { text: this.t('columns.product'), bold: true },
                                { text: this.t('columns.quantity'), bold: true, alignment: 'center' },
                                { text: this.t('columns.unitPrice'), bold: true, alignment: 'right' },
                                { text: this.t('columns.subtotal'), bold: true, alignment: 'right' },
                            ],
                            ...sale.items.map((item) => [
                                item.code,
                                item.name,
                                { text: String(item.quantity), alignment: 'center' },
                                { text: this.money(item.unitPriceCents), alignment: 'right' },
                                { text: this.money(item.subtotalCents), alignment: 'right' },
                            ]),
                        ],
                    },
                    layout: 'lightHorizontalLines',
                },
                line,
                this.buildTotalsBlock(sale),
                {
                    margin: [0, 4, 0, 0],
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 200,
                            stack: [
                                { text: this.translate.instant('app.sales.payment.title'), bold: true },
                                ...this.buildPaymentRows(sale),
                            ],
                        },
                    ],
                },
                { ...line, margin: [0, 10, 0, 10] },
                { text: this.t('footer'), alignment: 'center', italics: true },
            ],
        };
    }
}
