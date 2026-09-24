import { CurrencyPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';
import { ImageCompressorService, ToastService } from '@core/services';
import { GiftCard } from '../../../gift-cards/gift-card.model';
import { GiftCardsService } from '../../../gift-cards/gift-cards.service';
import { ProductsService } from '../../../products/products.service';
import { SaleReceiptService } from '../../sale-receipt.service';
import { SaleCartLine } from '../../sale.model';
import { SalesService } from '../../sales.service';
import { SalesPosComponent } from './sales-pos.component';

/**
 * Rebaja fija opcional del POS (Ajuste de Ventas, obs. 1): la lógica de
 * cálculo, la corrección cuando el carrito cambia, el reinicio entre ventas
 * y el payload que se envía a `createSale`. La validación DEFINITIVA es del
 * servidor (`functions/src/sale-discount.ts`); esto cubre solo la interfaz.
 */
describe('SalesPosComponent — rebaja', () => {
    const line = (unitPriceCents: number, quantity = 1, productId = 'p1'): SaleCartLine => ({
        productId,
        code: 'MP000001',
        name: 'Juguete',
        unitPriceCents,
        quantity,
        stockReference: 100,
    });
    const giftCard = (amountCents: number) =>
        ({
            cardCode: 'GC1000-001',
            amountCents,
            status: 'ACTIVE',
            activeCycleId: 'cycle-1',
        }) as unknown as GiftCard;

    let component: SalesPosComponent;
    let createSale: jasmine.Spy;
    let attachVoucher: jasmine.Spy;
    let toastInfo: jasmine.Spy;

    beforeEach(async () => {
        createSale = jasmine.createSpy('createSale').and.returnValue(of({ saleId: 'sale-1' }));
        attachVoucher = jasmine.createSpy('attachVoucherWithUpload').and.returnValue(of({ saleId: 'sale-1' }));
        toastInfo = jasmine.createSpy('info');

        await TestBed.configureTestingModule({
            imports: [SalesPosComponent, TranslateModule.forRoot()],
            providers: [
                provideRouter([]),
                provideNoopAnimations(),
                CurrencyPipe,
                ConfirmationService,
                { provide: ProductsService, useValue: {} },
                { provide: GiftCardsService, useValue: {} },
                {
                    provide: SalesService,
                    useValue: {
                        generateSaleId: () => 'sale-1',
                        createSale,
                        attachVoucherWithUpload: attachVoucher,
                        getSale: () => of(null),
                    },
                },
                { provide: SaleReceiptService, useValue: {} },
                { provide: ImageCompressorService, useValue: {} },
                {
                    provide: ToastService,
                    useValue: {
                        info: toastInfo,
                        error: jasmine.createSpy('error'),
                        success: jasmine.createSpy('success'),
                        errorMessage: jasmine.createSpy('errorMessage'),
                    },
                },
            ],
        }).compileComponents();

        const fixture = TestBed.createComponent(SalesPosComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('sin rebaja: el total es el subtotal (Bs 400 → Bs 400) y no se envía discountCents', () => {
        component.cart.set([line(40000)]);
        component.cashReceivedBs.set(400);

        expect(component.discountCents()).toBe(0);
        expect(component.subtotalCents()).toBe(40000);
        expect(component.totalCents()).toBe(40000);

        component.confirmSale();
        const payload = createSale.calls.mostRecent().args[0];
        expect(payload.discountCents).toBeUndefined();
        expect(payload.payments).toEqual([{ method: 'cash', amountCents: 40000 }]);
    });

    it('Bs 970 con rebaja Bs 20 → total Bs 950, y el pago en efectivo es de Bs 950', () => {
        component.cart.set([line(97000)]);
        component.onDiscountChange(2000);
        component.cashReceivedBs.set(950);

        expect(component.subtotalCents()).toBe(97000);
        expect(component.appliedDiscountCents()).toBe(2000);
        expect(component.totalCents()).toBe(95000);
        expect(component.changeCents()).toBe(0);
        expect(component.canConfirm()).toBeTrue();

        component.confirmSale();
        const payload = createSale.calls.mostRecent().args[0];
        expect(payload.discountCents).toBe(2000);
        expect(payload.payments).toEqual([{ method: 'cash', amountCents: 95000 }]);
    });

    it('caso reportado: BEAR ×2 (Bs 150), rebaja Bs 10, recibe Bs 150 → cambio Bs 10 y el payload lleva Bs 140', () => {
        component.cart.set([line(7500, 2)]);
        component.onDiscountChange(1000);
        component.cashReceivedBs.set(150);

        expect(component.subtotalCents()).toBe(15000);
        expect(component.totalCents()).toBe(14000);
        expect(component.changeCents()).toBe(1000); // el cambio es solo de pantalla

        component.confirmSale();
        const payload = createSale.calls.mostRecent().args[0];
        expect(payload).toEqual({
            saleId: 'sale-1',
            items: [{ productId: 'p1', quantity: 2 }],
            payments: [{ method: 'cash', amountCents: 14000 }], // aplicado, NO lo recibido (15000)
            customerName: undefined,
            discountCents: 1000,
        });
    });

    it('cada rebaja permitida resta exactamente su importe', () => {
        component.cart.set([line(97000)]);
        for (const discount of [500, 1000, 1500, 2000, 2500, 3000]) {
            component.onDiscountChange(discount);
            expect(component.totalCents()).toBe(97000 - discount);
        }
    });

    it('el efectivo recibido se compara contra el total final, no contra el subtotal', () => {
        component.cart.set([line(97000)]);
        component.onDiscountChange(2000);
        component.cashReceivedBs.set(949);
        expect(component.canConfirm()).toBeFalse(); // 949 < 950
        component.cashReceivedBs.set(960);
        expect(component.changeDisplayCents()).toBe(1000);
    });

    it('solo ofrece las rebajas permitidas y deshabilita las que no caben en el subtotal', () => {
        component.cart.set([line(2500)]); // Bs 25
        const byValue = Object.fromEntries(component.discountOptions().map((o) => [o.value, o.disabled]));

        expect(Object.keys(byValue).map(Number)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000]);
        expect(byValue[0]).toBeFalse();
        expect(byValue[2000]).toBeFalse();
        expect(byValue[2500]).toBeTrue(); // igual al subtotal → total cero
        expect(byValue[3000]).toBeTrue(); // mayor al subtotal → total negativo
    });

    it('si el carrito cambia y la rebaja deja de aplicar, se reinicia y se avisa', () => {
        component.cart.set([line(97000)]);
        component.onDiscountChange(3000);
        TestBed.flushEffects();
        expect(component.discountCents()).toBe(3000);
        expect(toastInfo).not.toHaveBeenCalled();

        component.cart.set([line(2000)]); // el subtotal baja a Bs 20 < Bs 30
        expect(component.appliedDiscountCents()).toBe(0); // nunca se aplica una rebaja inválida
        expect(component.totalCents()).toBe(2000);

        TestBed.flushEffects();
        expect(component.discountCents()).toBe(0);
        expect(toastInfo).toHaveBeenCalledOnceWith('app.sales.discount.resetByCart');
    });

    it('una rebaja que sigue siendo válida sobrevive a cambios del carrito', () => {
        component.cart.set([line(97000)]);
        component.onDiscountChange(2000);
        component.cart.set([line(97000), line(10000, 1, 'p2')]);
        TestBed.flushEffects();

        expect(component.discountCents()).toBe(2000);
        expect(component.totalCents()).toBe(107000 - 2000);
        expect(toastInfo).not.toHaveBeenCalled();
    });

    it('nueva venta: tras confirmar, la rebaja no se hereda', () => {
        component.cart.set([line(97000)]);
        component.onDiscountChange(2000);
        component.cashReceivedBs.set(950);

        component.confirmSale();
        TestBed.flushEffects();

        expect(component.discountCents()).toBe(0);
        expect(component.cart()).toEqual([]);
        expect(toastInfo).not.toHaveBeenCalled(); // limpiar no es una "corrección"

        component.cart.set([line(50000)]);
        expect(component.totalCents()).toBe(50000);
    });

    it('vaciar el carrito con rebaja elegida la reinicia sin avisos falsos', () => {
        component.cart.set([line(97000)]);
        component.onDiscountChange(2500);
        (component as unknown as { resetCart(): void }).resetCart();
        TestBed.flushEffects();

        expect(component.discountCents()).toBe(0);
        expect(toastInfo).not.toHaveBeenCalled();
    });

    describe('con Gift Card', () => {
        it('tarjeta de Bs 1.000, subtotal 970, rebaja 20 → aplica Bs 950 y sobran Bs 50', () => {
            component.cart.set([line(97000)]);
            component.onDiscountChange(2000);
            component.setPaymentMethod('giftcard');
            component.foundGiftCard.set(giftCard(100000));

            expect(component.giftCardAppliedCents()).toBe(95000);
            expect(component.giftCardForfeitCents()).toBe(5000);
            expect(component.giftCardDifferenceCents()).toBe(0);

            component.confirmSale();
            const payload = createSale.calls.mostRecent().args[0];
            expect(payload.discountCents).toBe(2000);
            expect(payload.payments).toEqual([
                {
                    method: 'giftcard',
                    amountCents: 95000,
                    giftCardId: 'GC1000-001',
                    giftCardCycleId: 'cycle-1',
                },
            ]);
        });

        it('tarjeta de Bs 500, total 950 → aplica Bs 500 y el complemento es de Bs 450', () => {
            component.cart.set([line(97000)]);
            component.onDiscountChange(2000);
            component.setPaymentMethod('giftcard');
            component.foundGiftCard.set(giftCard(50000));
            component.giftCardDifferenceMethod.set('qr');

            expect(component.giftCardAppliedCents()).toBe(50000);
            expect(component.giftCardForfeitCents()).toBe(0);
            expect(component.giftCardDifferenceCents()).toBe(45000);

            const totalBeforeConfirm = component.totalCents(); // confirmSale vacía el carrito
            component.confirmSale();
            const payments = createSale.calls.mostRecent().args[0].payments;
            expect(payments.map((p: { method: string; amountCents: number }) => [p.method, p.amountCents])).toEqual(
                [
                    ['giftcard', 50000],
                    ['qr', 45000],
                ],
            );
            // Σ pagos === total final; la rebaja no es un pago
            expect(payments.reduce((s: number, p: { amountCents: number }) => s + p.amountCents, 0)).toBe(
                totalBeforeConfirm,
            );
            expect(totalBeforeConfirm).toBe(95000);
        });
    });

    describe('con QR', () => {
        it('el pago QR es del total final', () => {
            component.cart.set([line(97000)]);
            component.onDiscountChange(2000);
            component.setPaymentMethod('qr');

            component.confirmSale();
            const payload = createSale.calls.mostRecent().args[0];
            expect(payload.payments).toEqual([{ method: 'qr', amountCents: 95000 }]);
            expect(payload.discountCents).toBe(2000);
        });
    });

    /**
     * Ajuste de Ventas, obs. 2: «Efectivo + QR». Todas usan la venta de la
     * reunión: BEAR ×2 = Bs 150, rebaja Bs 10 → total Bs 140.
     */
    describe('Efectivo + QR', () => {
        const startMixedSale = () => {
            component.cart.set([line(7500, 2)]);
            component.onDiscountChange(1000);
            component.setPaymentMethod('cashqr');
        };
        const payloadOf = () => createSale.calls.mostRecent().args[0];
        const blob = () => new Blob(['x'], { type: 'image/webp' });

        it('A: QR 40 → efectivo aplicado 100; recibe 100 → cambio 0; payments = [cash 10000, qr 4000]', () => {
            startMixedSale();
            component.qrPartBs.set(40);
            component.cashReceivedBs.set(100);

            expect(component.totalCents()).toBe(14000);
            expect(component.mixedCashCents()).toBe(10000);
            expect(component.mixedQrCents()).toBe(4000);
            expect(component.changeCents()).toBe(0);
            expect(component.canConfirm()).toBeTrue();

            component.confirmSale();
            expect(createSale).toHaveBeenCalledTimes(1);
            expect(payloadOf().payments).toEqual([
                { method: 'cash', amountCents: 10000 },
                { method: 'qr', amountCents: 4000 },
            ]);
            expect(payloadOf().discountCents).toBe(1000);
        });

        it('B: recibe Bs 200 → cambio Bs 100 sobre el efectivo APLICADO, y NO se envía ni se guarda recibido/cambio', () => {
            startMixedSale();
            component.qrPartBs.set(40);
            component.cashReceivedBs.set(200);

            expect(component.changeCents()).toBe(10000); // 200 − 100, no 200 − 140
            expect(component.changeDisplayCents()).toBe(10000);

            component.confirmSale();
            const payload = payloadOf();
            expect(payload.payments).toEqual([
                { method: 'cash', amountCents: 10000 }, // NO 20000
                { method: 'qr', amountCents: 4000 },
            ]);
            expect(Object.keys(payload).sort()).toEqual(['customerName', 'discountCents', 'items', 'payments', 'saleId']);
            const paid = payload.payments.reduce((s: number, p: { amountCents: number }) => s + p.amountCents, 0);
            expect(paid).toBe(14000); // el cambio no es ingreso
        });

        it('QR 100 → efectivo aplicado 40 (el orden de pensar los importes no existe)', () => {
            startMixedSale();
            component.qrPartBs.set(100);
            component.cashReceivedBs.set(40);

            expect(component.mixedCashCents()).toBe(4000);
            component.confirmSale();
            expect(payloadOf().payments).toEqual([
                { method: 'cash', amountCents: 4000 },
                { method: 'qr', amountCents: 10000 },
            ]);
        });

        it('bloquea confirmar con QR = 0, = total, > total, negativo, vacío o inválido', () => {
            startMixedSale();
            component.cashReceivedBs.set(1000);

            for (const bad of [0, 140, 150, -5, null, NaN]) {
                component.qrPartBs.set(bad);
                expect(component.canConfirm()).withContext(`QR = ${bad}`).toBeFalse();
                component.confirmSale();
            }
            expect(createSale).not.toHaveBeenCalled();
            expect(component.mixedQrInvalid()).toBeTrue(); // el último (NaN) es inválido, no vacío
        });

        it('bloquea confirmar si el efectivo recibido es menor al efectivo aplicado', () => {
            startMixedSale();
            component.qrPartBs.set(40);
            component.cashReceivedBs.set(99.99);
            expect(component.canConfirm()).toBeFalse();
            component.cashReceivedBs.set(100);
            expect(component.canConfirm()).toBeTrue();
            component.cashReceivedBs.set(null);
            expect(component.canConfirm()).toBeFalse();
        });

        it('cambiar la rebaja invalida el QR → se reinicia con aviso y no deja confirmar', () => {
            component.cart.set([line(7500, 2)]);
            component.setPaymentMethod('cashqr');
            component.qrPartBs.set(145); // total 150: válido (efectivo 5)
            component.cashReceivedBs.set(500);
            TestBed.flushEffects();
            expect(component.canConfirm()).toBeTrue();

            component.onDiscountChange(1000); // total 140 < QR 145
            expect(component.canConfirm()).toBeFalse(); // ya bloqueado ANTES de que corra el effect

            TestBed.flushEffects();
            expect(component.qrPartBs()).toBeNull();
            expect(toastInfo).toHaveBeenCalledOnceWith('app.sales.mixed.resetByTotal');
        });

        it('cambiar la rebaja con un QR que sigue siendo válido lo conserva y recalcula el efectivo', () => {
            startMixedSale();
            component.qrPartBs.set(40);
            TestBed.flushEffects();

            component.onDiscountChange(0); // total 150
            TestBed.flushEffects();
            expect(component.qrPartBs()).toBe(40);
            expect(component.mixedCashCents()).toBe(11000);
            expect(toastInfo).not.toHaveBeenCalled();
        });

        it('cambiar la cantidad invalida el QR → se reinicia con aviso', () => {
            component.cart.set([line(7500, 2)]);
            component.setPaymentMethod('cashqr');
            component.qrPartBs.set(100); // total 150
            component.cashReceivedBs.set(500);
            TestBed.flushEffects();

            component.decrementQty(component.cart()[0]); // total 75 < QR 100
            expect(component.canConfirm()).toBeFalse();
            TestBed.flushEffects();

            expect(component.qrPartBs()).toBeNull();
            expect(toastInfo).toHaveBeenCalledOnceWith('app.sales.mixed.resetByTotal');
        });

        it('escribir un QR inválido NO se borra solo mientras el total no cambie', () => {
            startMixedSale();
            TestBed.flushEffects(); // en la app, el carrito ya se procesó antes de que el vendedor teclee
            component.qrPartBs.set(200);
            TestBed.flushEffects();
            expect(component.qrPartBs()).toBe(200);
            expect(component.mixedQrInvalid()).toBeTrue();
            expect(toastInfo).not.toHaveBeenCalled();
        });

        it('cambiar de método limpia el QR; confirmar limpia todo para la siguiente venta', () => {
            startMixedSale();
            component.qrPartBs.set(40);
            component.setPaymentMethod('cash');
            expect(component.qrPartBs()).toBeNull();

            component.setPaymentMethod('cashqr');
            component.qrPartBs.set(40);
            component.cashReceivedBs.set(100);
            component.confirmSale();
            TestBed.flushEffects();

            expect(component.qrPartBs()).toBeNull();
            expect(component.paymentMethod()).toBe('cash');
            expect(component.discountCents()).toBe(0);
            expect(toastInfo).not.toHaveBeenCalled();
        });

        it('Gift Card + Efectivo + QR no se ofrece: el modo mixto queda fuera del flujo de gift card', () => {
            startMixedSale();
            component.setPaymentMethod('giftcard');
            component.foundGiftCard.set(giftCard(5000));
            component.confirmSale();
            const payments = payloadOf().payments as { method: string }[];
            expect(payments.length).toBe(2); // gift card + UNA diferencia
            expect(payments.map((p) => p.method)).toEqual(['giftcard', 'cash']);
        });

        describe('voucher QR: índice real del pago', () => {
            it('QR único → índice 0', () => {
                component.cart.set([line(14000)]);
                component.setPaymentMethod('qr');
                const image = blob();
                component.voucherImage.set(image);
                component.confirmSale();

                expect(attachVoucher).toHaveBeenCalledOnceWith('sale-1', 0, image);
            });

            it('Efectivo + QR → índice 1 (el QR NO es el primer pago)', () => {
                startMixedSale();
                component.qrPartBs.set(40);
                component.cashReceivedBs.set(100);
                const image = blob();
                component.voucherImage.set(image);
                component.confirmSale();

                expect(payloadOf().payments.map((p: { method: string }) => p.method)).toEqual(['cash', 'qr']);
                expect(attachVoucher).toHaveBeenCalledOnceWith('sale-1', 1, image);
            });

            it('Gift Card + QR → índice 1', () => {
                component.cart.set([line(14000)]);
                component.setPaymentMethod('giftcard');
                component.foundGiftCard.set(giftCard(5000));
                component.giftCardDifferenceMethod.set('qr');
                const image = blob();
                component.voucherImage.set(image); // el POS hoy no ofrece foto aquí; el índice se resuelve igual
                component.confirmSale();

                expect(payloadOf().payments.map((p: { method: string }) => p.method)).toEqual(['giftcard', 'qr']);
                expect(attachVoucher).toHaveBeenCalledOnceWith('sale-1', 1, image);
            });

            it('sin foto seleccionada (voucher opcional) → no se adjunta nada y la venta se registra igual', () => {
                startMixedSale();
                component.qrPartBs.set(40);
                component.cashReceivedBs.set(100);
                component.confirmSale();

                expect(createSale).toHaveBeenCalledTimes(1);
                expect(attachVoucher).not.toHaveBeenCalled();
            });

            it('sin pago QR (Gift Card + efectivo) → nunca intenta adjuntar', () => {
                component.cart.set([line(14000)]);
                component.setPaymentMethod('giftcard');
                component.foundGiftCard.set(giftCard(5000));
                component.giftCardDifferenceMethod.set('cash');
                component.voucherImage.set(blob());
                component.confirmSale();

                expect(attachVoucher).not.toHaveBeenCalled();
            });
        });
    });
});
