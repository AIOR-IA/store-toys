import { CurrencyPipe } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '@core/services';
import { AppSettings } from '@core/models';
import { fromCents } from '@core/utils';
import { formatInStoreTimezone } from '@core/utils/date.util';
import { RECEIPT_LOGO_BASE64 } from '../sales/receipt-logo.const';
import { RECEIPT_ADDRESS_LINE, RECEIPT_WHATSAPP_LINE } from '../sales/receipt-header.const';
import { GiftCardReceipt, GiftCardTopUpReceipt } from './gift-card.model';

type PdfMake = {
    createPdf: (doc: unknown) => { print: () => void; download: (name: string) => void };
    addVirtualFileSystem: (vfs: unknown) => void;
};

/**
 * Comprobante PDF de UNA emisión/venta real de Gift Card (ajuste posterior,
 * Recibo/Historial de Gift Cards). Réplica deliberada de `SaleReceiptService`
 * (auditado como la REFERENCIA DIRECTA del prompt): mismo logo, mismo
 * encabezado de tienda, mismo formato monetario, misma hoja carta y el mismo
 * mecanismo `pdfmake().print()` — un reemplazo (`replaceGiftCard`) nunca
 * llega aquí porque ni `getGiftCardIssue` ni el Historial lo exponen (ver
 * `functions/src/giftcards.ts`): esta es una Function distinta, de Gift
 * Cards, no una extensión de `SaleReceiptService` (Productos estabilizó su
 * propia geometría en 3 rondas de ajustes — se duplica infraestructura a
 * propósito, igual que ya se decidió para la hoja de etiquetas, Fase 6).
 *
 * Generado SIEMPRE desde el SNAPSHOT del ciclo (`GiftCardReceipt`, nunca
 * `GiftCard`): el mismo documento sirve tanto para "Imprimir recibo" justo
 * después de vender como para reimprimir desde el Historial, así los dos
 * caminos nunca pueden mostrar algo distinto para el mismo ciclo (prompt
 * §16).
 */
@Injectable({ providedIn: 'root' })
export class GiftCardReceiptService {
    private readonly settingsService = inject(SettingsService);
    private readonly translate = inject(TranslateService);
    private readonly currencyPipe = inject(CurrencyPipe);

    async print(receipt: GiftCardReceipt): Promise<void> {
        const settings = await firstValueFrom(this.settingsService.getSettings());
        const [pdfMakeMod, vfsFontsMod] = await Promise.all([
            import('pdfmake/build/pdfmake'),
            import('pdfmake/build/vfs_fonts'),
        ]);
        const pdfMake = (pdfMakeMod as { default?: PdfMake }).default as PdfMake;
        const vfs = (vfsFontsMod as { default?: unknown }).default ?? vfsFontsMod;
        pdfMake.addVirtualFileSystem(vfs);

        pdfMake.createPdf(this.buildDocDefinition(receipt, settings)).print();
    }

    /**
     * Comprobante de una RECARGA (Fase E, plan §16.18/§16.22): misma
     * infraestructura (`pdfmake`, logo, encabezado de tienda) que
     * `print()`, pero explícitamente NO es "venta nueva" — ninguna gift
     * card se emite ni se cobra de nuevo aquí, solo se agrega saldo al
     * MISMO ciclo. Generado en el instante desde la respuesta ya recibida
     * de `topUpGiftCard`, nunca releído (`giftCardTopUps` sigue cerrada,
     * ver el comentario de `GiftCardTopUpReceipt`).
     */
    async printTopUp(receipt: GiftCardTopUpReceipt): Promise<void> {
        const settings = await firstValueFrom(this.settingsService.getSettings());
        const [pdfMakeMod, vfsFontsMod] = await Promise.all([
            import('pdfmake/build/pdfmake'),
            import('pdfmake/build/vfs_fonts'),
        ]);
        const pdfMake = (pdfMakeMod as { default?: PdfMake }).default as PdfMake;
        const vfs = (vfsFontsMod as { default?: unknown }).default ?? vfsFontsMod;
        pdfMake.addVirtualFileSystem(vfs);

        pdfMake.createPdf(this.buildTopUpDocDefinition(receipt, settings)).print();
    }

    private buildTopUpDocDefinition(receipt: GiftCardTopUpReceipt, settings: AppSettings): unknown {
        const dateStr = formatInStoreTimezone(receipt.createdAt, settings.timezone);
        const line = { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }] };
        const paymentRows = receipt.payments.map((payment) => ({
            columns: [
                { text: this.translate.instant(`app.sales.payment.${payment.method}`), width: '*' },
                { text: this.money(payment.amountCents), width: 'auto', alignment: 'right' },
            ],
        }));

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
                                { text: RECEIPT_ADDRESS_LINE },
                                { text: RECEIPT_WHATSAPP_LINE },
                            ],
                        },
                    ],
                },
                { ...line, margin: [0, 10, 0, 10] },
                { text: this.translate.instant('app.giftCards.topUpReceipt.title'), bold: true },
                {
                    columns: [
                        { text: `${this.t('date')}: ${dateStr} (La Paz)` },
                        { text: `${this.t('code')}: ${receipt.cardCode}`, alignment: 'right' },
                    ],
                    margin: [0, 4, 0, 0],
                },
                {
                    text: `${this.t('seller')}: ${receipt.performedByName}`,
                    margin: [0, 4, 0, 10],
                },
                line,
                {
                    margin: [0, 10, 0, 0],
                    columns: [
                        { text: this.translate.instant('app.giftCards.topUpReceipt.balanceBefore'), width: '*' },
                        { text: this.money(receipt.balanceBeforeCents), width: 'auto', alignment: 'right' },
                    ],
                },
                {
                    margin: [0, 4, 0, 0],
                    columns: [
                        { text: this.translate.instant('app.giftCards.topUpReceipt.amountAdded'), width: '*', bold: true },
                        {
                            text: this.money(receipt.amountAddedCents),
                            width: 'auto',
                            alignment: 'right',
                            bold: true,
                        },
                    ],
                },
                {
                    margin: [0, 4, 0, 0],
                    columns: [
                        { text: this.translate.instant('app.giftCards.topUpReceipt.balanceAfter'), width: '*', bold: true },
                        {
                            text: this.money(receipt.balanceAfterCents),
                            width: 'auto',
                            alignment: 'right',
                            bold: true,
                        },
                    ],
                },
                {
                    margin: [0, 10, 0, 0],
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 200,
                            stack: [
                                { text: this.translate.instant('app.sales.payment.title'), bold: true },
                                ...paymentRows,
                            ],
                        },
                    ],
                },
                { ...line, margin: [0, 10, 0, 10] },
                { text: this.t('footer'), alignment: 'center', italics: true },
            ],
        };
    }

    private money(cents: number): string {
        return this.currencyPipe.transform(fromCents(cents), 'BOB', 'Bs', '1.2-2') ?? '';
    }

    private t(key: string, params?: Record<string, unknown>): string {
        return this.translate.instant(`app.giftCards.receipt.${key}`, params);
    }

    /** Mismo desglose por método que `SaleReceiptService.buildPaymentRows` — cada pago imprime su propio monto, nunca el total junto a los dos nombres combinados. */
    private buildPaymentRows(receipt: GiftCardReceipt): unknown[] {
        return receipt.payments.map((payment) => ({
            columns: [
                { text: this.translate.instant(`app.sales.payment.${payment.method}`), width: '*' },
                { text: this.money(payment.amountCents), width: 'auto', alignment: 'right' },
            ],
        }));
    }

    private buildDocDefinition(receipt: GiftCardReceipt, settings: AppSettings): unknown {
        const shortId = receipt.id.slice(-8).toUpperCase();
        const dateStr = formatInStoreTimezone(receipt.activatedAt, settings.timezone);
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
                                { text: RECEIPT_ADDRESS_LINE },
                                { text: RECEIPT_WHATSAPP_LINE },
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
                        { text: `${this.t('code')}: ${receipt.cardCode}`, alignment: 'right' },
                    ],
                    margin: [0, 4, 0, 0],
                },
                {
                    columns: [
                        {
                            text: `${this.t('buyer')}: ${receipt.buyerName ?? this.translate.instant('app.sales.receipt.anonymous')}`,
                        },
                        { text: `${this.t('seller')}: ${receipt.activatedByName}`, alignment: 'right' },
                    ],
                    margin: [0, 4, 0, 10],
                },
                line,
                {
                    margin: [0, 10, 0, 0],
                    text: `${this.t('amount')}    ${this.money(receipt.amountCents)}`,
                    bold: true,
                },
                {
                    margin: [0, 10, 0, 0],
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 200,
                            stack: [
                                { text: this.translate.instant('app.sales.payment.title'), bold: true },
                                ...this.buildPaymentRows(receipt),
                            ],
                        },
                    ],
                },
                {
                    margin: [0, 10, 0, 0],
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 'auto',
                            text: `${this.t('totalPaid')}    ${this.money(receipt.amountCents)}`,
                            bold: true,
                        },
                    ],
                },
                { ...line, margin: [0, 10, 0, 10] },
                { text: this.t('footer'), alignment: 'center', italics: true },
            ],
        };
    }
}
