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
});
