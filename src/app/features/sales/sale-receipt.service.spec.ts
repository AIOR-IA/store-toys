import { CurrencyPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { SettingsService } from '@core/services';
import { SaleReceiptService } from './sale-receipt.service';
import { Sale } from './sale.model';

/**
 * El recibo usa el MISMO formatter que la UI: el snapshot histórico
 * (`item.name`) se imprime en MAYÚSCULAS sin modificar el documento.
 */
describe('SaleReceiptService — nombre de producto', () => {
    it('imprime el nombre formateado y no toca el snapshot de la venta', async () => {
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

        const sale = {
            id: 'abcdef123456',
            createdAt: Timestamp.now(),
            sellerName: 'Ana',
            payments: [],
            discountCents: 0,
            subtotalCents: 9000,
            totalCents: 9000,
            items: [
                {
                    productId: 'p1',
                    code: 'MP000001',
                    name: 'Juguete transformer',
                    quantity: 2,
                    unitPriceCents: 4500,
                    subtotalCents: 9000,
                },
            ],
        } as unknown as Sale;

        await TestBed.inject(SaleReceiptService).print(sale);

        const text = JSON.stringify(doc);
        expect(text).toContain('JUGUETE TRANSFORMER');
        expect(text).not.toContain('Juguete transformer');
        expect(sale.items[0].name).toBe('Juguete transformer');
    });

    it('Venta Extra: una línea EXTRA imprime su nombre/cantidad/precio con el badge en vez de un código', async () => {
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

        const sale = {
            id: 'abcdef123456',
            createdAt: Timestamp.now(),
            sellerName: 'Ana',
            payments: [],
            discountCents: 0,
            subtotalCents: 2000,
            totalCents: 2000,
            items: [
                { kind: 'EXTRA', name: 'Chocolate', quantity: 2, unitPriceCents: 1000, subtotalCents: 2000 },
            ],
        } as unknown as Sale;

        await TestBed.inject(SaleReceiptService).print(sale);

        const text = JSON.stringify(doc);
        expect(text).toContain('CHOCOLATE');
        expect(text).toContain('app.sales.extra.badge'); // TranslateModule.forRoot() sin catálogo: instant() devuelve la clave
    });
});

/**
 * Saldo persistente (Fase E, plan §16.18/§16.23): el recibo PDF imprime el
 * saldo ANTES/DESPUÉS de un pago `giftcard`, siempre desde el SNAPSHOT
 * congelado de la venta — nunca releyendo el estado actual de la tarjeta.
 * Una venta ANTERIOR a esa fase (sin estos campos) se imprime exactamente
 * igual que siempre.
 */
describe('SaleReceiptService — saldo persistente de Gift Card (Fase E)', () => {
    async function printAndCapture(sale: Sale): Promise<string> {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                {
                    provide: SettingsService,
                    useValue: {
                        getSettings: () => of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }),
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
        await TestBed.inject(SaleReceiptService).print(sale);
        return JSON.stringify(doc);
    }

    const baseSale = (payment: Record<string, unknown>): Sale =>
        ({
            id: 'abcdef123456',
            createdAt: Timestamp.now(),
            sellerName: 'Ana',
            discountCents: 0,
            subtotalCents: 9500,
            totalCents: 9500,
            items: [
                { productId: 'p1', code: 'MP000001', name: 'Juguete', quantity: 1, unitPriceCents: 9500, subtotalCents: 9500 },
            ],
            payments: [
                { method: 'giftcard', amountCents: 9500, giftCardCode: 'GC000002', giftCardCycleNumber: 1, ...payment },
            ],
        }) as unknown as Sale;

    it('consumo PARCIAL (queda saldo): imprime saldo anterior y restante, nunca "sobrante perdido"', async () => {
        const text = await printAndCapture(
            baseSale({ giftCardBalanceBeforeCents: 25000, giftCardBalanceAfterCents: 15500 }),
        );
        expect(text).toContain('app.sales.giftCard.balanceBeforeLabel');
        expect(text).toContain('app.sales.giftCard.balanceAfterLabel');
        expect(text).not.toContain('app.sales.giftCard.forfeitedLabel');
        expect(text).not.toContain('app.sales.giftCard.exhaustedLabel');
    });

    it('saldo EXACTAMENTE agotado (balanceAfterCents = 0): imprime "Saldo agotado", nunca "Saldo restante: Bs 0"', async () => {
        const text = await printAndCapture(
            baseSale({ giftCardBalanceBeforeCents: 9500, giftCardBalanceAfterCents: 0 }),
        );
        expect(text).toContain('app.sales.giftCard.exhaustedLabel');
        expect(text).not.toContain('app.sales.giftCard.balanceAfterLabel');
    });

    it('venta LEGACY (sin campos de saldo persistente): se imprime igual que siempre, con el sobrante si lo hubo', async () => {
        const text = await printAndCapture(baseSale({ giftCardForfeitedCents: 500 }));
        expect(text).toContain('app.sales.giftCard.forfeitedLabel');
        expect(text).not.toContain('app.sales.giftCard.balanceBeforeLabel');
        expect(text).not.toContain('app.sales.giftCard.exhaustedLabel');
    });

    it('venta LEGACY sin forfeit (sobrante 0): no imprime ninguna línea extra de saldo', async () => {
        const text = await printAndCapture(baseSale({ giftCardForfeitedCents: 0 }));
        expect(text).not.toContain('app.sales.giftCard.forfeitedLabel');
        expect(text).not.toContain('app.sales.giftCard.balanceBeforeLabel');
    });
});
