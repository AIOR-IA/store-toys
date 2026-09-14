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

    private buildDocDefinition(sale: Sale, settings: AppSettings): unknown {
        const shortId = sale.id.slice(-8).toUpperCase();
        const dateStr = formatInStoreTimezone(sale.createdAt, settings.timezone);
        const paymentLabel = sale.paymentMethods
            .map((method) => this.translate.instant(`app.sales.payment.${method}`))
            .join(' + ');
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
                {
                    margin: [0, 10, 0, 0],
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 'auto',
                            text: `${this.t('total')}    ${this.money(sale.totalCents)}`,
                            bold: true,
                        },
                    ],
                },
                {
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 'auto',
                            text: `${this.t('payment')}: ${paymentLabel}    ${this.money(sale.totalCents)}`,
                        },
                    ],
                },
                { ...line, margin: [0, 10, 0, 10] },
                { text: this.t('footer'), alignment: 'center', italics: true },
            ],
        };
    }
}
