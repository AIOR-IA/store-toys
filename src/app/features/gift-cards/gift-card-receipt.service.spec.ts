import { CurrencyPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { SettingsService } from '@core/services';
import { fromCents } from '@core/utils';
import { GiftCardReceiptService } from './gift-card-receipt.service';
import { GiftCardReceipt } from './gift-card.model';

/**
 * Recibo de Gift Card (ajuste posterior, Recibo/Historial — prompt §21,
 * letras A-H). Mismo estilo de prueba que `sale-receipt.service.spec.ts`:
 * se intercepta `pdfmake.createPdf` y se inspecciona el documento como
 * texto, en vez de renderizar un PDF real.
 */
describe('GiftCardReceiptService', () => {
    let currencyPipe: CurrencyPipe;
    let service: GiftCardReceiptService;

    const money = (cents: number) => currencyPipe.transform(fromCents(cents), 'BOB', 'Bs', '1.2-2') ?? '';

    const baseReceipt = (overrides: Partial<GiftCardReceipt> = {}): GiftCardReceipt => ({
        id: 'issueAbcdef123456',
        cardCode: 'GC-000010',
        cycleNumber: 1,
        amountCents: 50000,
        buyerName: 'Camila',
        activatedAt: Timestamp.now(),
        activatedByName: 'Lenar Lima',
        dateKey: '2026-10-24',
        payments: [{ method: 'qr', amountCents: 50000 }],
        ...overrides,
    });

    const run = async (receipt: GiftCardReceipt): Promise<string> => {
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        const spy = spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);
        await service.print(receipt);
        spy.calls.reset();
        return JSON.stringify(doc);
    };

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                {
                    provide: SettingsService,
                    useValue: {
                        getSettings: () =>
                            of({
                                storeName: 'Mi Pimpollito',
                                storeTagline: 'Juguetería',
                                storeDescription: 'Oruro, Bolivia',
                                address: 'Calle Falsa 123',
                                phone: '70000000',
                                social: '',
                                timezone: 'America/La_Paz',
                            }),
                    },
                },
            ],
        });
        currencyPipe = TestBed.inject(CurrencyPipe);
        service = TestBed.inject(GiftCardReceiptService);
    });

    // `TranslateModule.forRoot()` sin loader (mismo criterio que el resto de
    // specs de este repo, p. ej. `sale-receipt.service.spec.ts`) no traduce:
    // `translate.instant('app.sales.payment.cash')` devuelve la CLAVE tal
    // cual. Se verifica por lo tanto la clave i18n correcta para cada
    // método — es lo que prueba que el recibo usa `payment.method`, no un
    // texto fijo — y el monto exacto vía el mismo `CurrencyPipe` que usa el
    // servicio.

    it('A) venta Bs 500 cash → el recibo usa la clave de "Efectivo" y Bs 500', async () => {
        const text = await run(
            baseReceipt({ amountCents: 50000, payments: [{ method: 'cash', amountCents: 50000 }] }),
        );
        expect(text).toContain('app.sales.payment.cash');
        expect(text).not.toContain('app.sales.payment.qr');
        expect(text).toContain(money(50000));
    });

    it('B) venta Bs 500 QR → el recibo usa la clave de QR', async () => {
        const text = await run(
            baseReceipt({ amountCents: 50000, payments: [{ method: 'qr', amountCents: 50000 }] }),
        );
        expect(text).toContain('app.sales.payment.qr');
        expect(text).not.toContain('app.sales.payment.cash');
        expect(text).toContain(money(50000));
    });

    it('C) cash+qr soportado → desglose correcto, cada pago con su propio monto', async () => {
        const text = await run(
            baseReceipt({
                amountCents: 50000,
                payments: [
                    { method: 'cash', amountCents: 30000 },
                    { method: 'qr', amountCents: 20000 },
                ],
            }),
        );
        expect(text).toContain('app.sales.payment.cash');
        expect(text).toContain('app.sales.payment.qr');
        expect(text).toContain(money(30000));
        expect(text).toContain(money(20000));
    });

    it('D) comprador correcto', async () => {
        const text = await run(baseReceipt({ buyerName: 'Camila' }));
        expect(text).toContain('Camila');
    });

    it('D2) comprador ausente → usa la MISMA clave "anonymous" que el recibo de Ventas', async () => {
        const text = await run(baseReceipt({ buyerName: null }));
        expect(text).toContain('app.sales.receipt.anonymous');
    });

    it('E) vendedor original correcto (activatedByName del snapshot, nunca quien reimprime)', async () => {
        const text = await run(baseReceipt({ activatedByName: 'Lenar Lima' }));
        expect(text).toContain('Lenar Lima');
    });

    it('F) código de la tarjeta correcto', async () => {
        const text = await run(baseReceipt({ cardCode: 'GC-000010' }));
        expect(text).toContain('GC-000010');
    });

    it('G) fecha de venta correcta, en la zona de la tienda (La Paz, UTC-4)', async () => {
        const activatedAt = Timestamp.fromMillis(Date.parse('2026-10-24T17:45:00Z')); // 13:45 en La Paz
        const text = await run(baseReceipt({ activatedAt }));
        expect(text).toContain('24/10/2026 13:45');
    });

    it('H) usa amountCents del snapshot del ciclo, nunca un monto "actual" distinto', async () => {
        const text = await run(baseReceipt({ amountCents: 50000 }));
        expect(text).toContain(money(50000));
        expect(text).not.toContain(money(100000)); // "monto actual" hipotético tras un cambio posterior
    });
});
