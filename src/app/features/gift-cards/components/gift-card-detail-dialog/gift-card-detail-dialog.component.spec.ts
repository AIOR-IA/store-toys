import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurrencyPipe } from '@angular/common';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmationService } from 'primeng/api';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { SessionService } from '@core/session';
import { ToastService } from '@core/services';
import { GiftCard } from '../../gift-card.model';
import { GiftCardsService } from '../../gift-cards.service';
import { GiftCardDetailDialogComponent } from './gift-card-detail-dialog.component';

/**
 * Identidad ≠ monto (ajuste posterior, plan §16.13): "Editar monto" solo
 * para admin + AVAILABLE; "Reemplazar" solo para admin + (ACTIVE/SUSPENDED,
 * o CANCELLED con `pendingReplacement`) y nunca si ya fue reemplazada. La
 * elegibilidad server-side es la real (ver `functions/src/giftcards.ts`);
 * aquí se prueba que el frontend refleja EXACTAMENTE el mismo criterio, para
 * no mostrar una acción que la Function de todas formas rechazaría.
 */
describe('GiftCardDetailDialogComponent — identidad ≠ monto (editar monto / reemplazar)', () => {
    const timestamp = (ms = 0) => ({ toDate: () => new Date(ms) }) as unknown as GiftCard['createdAt'];

    const baseCard = (overrides: Partial<GiftCard> = {}): GiftCard =>
        ({
            cardCode: 'GC-000001',
            amountCents: 10000,
            status: 'AVAILABLE',
            cycleNumber: 0,
            activeCycleId: null,
            lastCycleId: null,
            replacedByCode: null,
            replacesCode: null,
            pendingReplacement: false,
            currentBuyerName: null,
            activatedAt: null,
            activatedBy: null,
            activatedByName: null,
            suspendedAt: null,
            suspendedBy: null,
            suspendedByName: null,
            suspensionReason: null,
            cancelledAt: null,
            cancelledBy: null,
            cancelledByName: null,
            cancelReason: null,
            createdAt: timestamp(),
            createdBy: 'admin',
            createdByName: 'Ad Min',
            updatedAt: timestamp(),
            ...overrides,
        }) as GiftCard;

    let fixture: ComponentFixture<GiftCardDetailDialogComponent>;
    let component: GiftCardDetailDialogComponent;
    let sessionRole = signal<{ status: string; role: string }>({ status: 'active', role: 'admin' });
    let updateGiftCardAmount: jasmine.Spy;
    let replaceGiftCard: jasmine.Spy;

    const setUp = async (card: GiftCard, role: 'admin' | 'user' = 'admin') => {
        sessionRole.set({ status: 'active', role });
        updateGiftCardAmount = jasmine.createSpy('updateGiftCardAmount').and.returnValue(
            of({ cardCode: card.cardCode, amountCents: 0 }),
        );
        replaceGiftCard = jasmine.createSpy('replaceGiftCard').and.returnValue(
            of({ cardCode: card.cardCode, newCardCode: 'GC-000099', amountCents: card.amountCents }),
        );

        await TestBed.configureTestingModule({
            imports: [GiftCardDetailDialogComponent, TranslateModule.forRoot()],
            providers: [
                provideNoopAnimations(),
                CurrencyPipe,
                {
                    provide: GiftCardsService,
                    useValue: {
                        getMovements: () => of([]),
                        updateGiftCardAmount,
                        replaceGiftCard,
                    },
                },
                { provide: SessionService, useValue: { session: sessionRole } },
                {
                    provide: ToastService,
                    useValue: {
                        success: jasmine.createSpy('success'),
                        error: jasmine.createSpy('error'),
                        errorMessage: jasmine.createSpy('errorMessage'),
                    },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(GiftCardDetailDialogComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('visible', true);
        fixture.componentRef.setInput('card', card);
        fixture.detectChanges();
    };

    describe('canEditAmount', () => {
        it('A) admin + AVAILABLE: true', async () => {
            await setUp(baseCard({ status: 'AVAILABLE' }), 'admin');
            expect(component.canEditAmount()).toBeTrue();
        });

        it('B) admin + ACTIVE: false (congelado)', async () => {
            await setUp(baseCard({ status: 'ACTIVE' }), 'admin');
            expect(component.canEditAmount()).toBeFalse();
        });

        it('C) admin + SUSPENDED: false (congelado)', async () => {
            await setUp(baseCard({ status: 'SUSPENDED' }), 'admin');
            expect(component.canEditAmount()).toBeFalse();
        });

        it('D) vendedor (no admin) + AVAILABLE: false', async () => {
            await setUp(baseCard({ status: 'AVAILABLE' }), 'user');
            expect(component.canEditAmount()).toBeFalse();
        });
    });

    describe('canReplace', () => {
        it('E) admin + ACTIVE: true', async () => {
            await setUp(baseCard({ status: 'ACTIVE' }), 'admin');
            expect(component.canReplace()).toBeTrue();
        });

        it('F) admin + SUSPENDED: true', async () => {
            await setUp(baseCard({ status: 'SUSPENDED' }), 'admin');
            expect(component.canReplace()).toBeTrue();
        });

        it('G) admin + CANCELLED con pendingReplacement: true', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            expect(component.canReplace()).toBeTrue();
        });

        it('H) admin + CANCELLED SIN pendingReplacement (nunca se vendió): false', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: false }), 'admin');
            expect(component.canReplace()).toBeFalse();
        });

        it('I) admin + CANCELLED, tarjeta histórica sin el campo (undefined): false, nunca "fantasma"', async () => {
            const card = baseCard({ status: 'CANCELLED' });
            delete (card as Partial<GiftCard>).pendingReplacement;
            await setUp(card, 'admin');
            expect(component.canReplace()).toBeFalse();
        });

        it('J) admin + AVAILABLE: false (nada pagado pendiente)', async () => {
            await setUp(baseCard({ status: 'AVAILABLE' }), 'admin');
            expect(component.canReplace()).toBeFalse();
        });

        it('K) ya reemplazada (replacedByCode no nulo): false aunque esté ACTIVE', async () => {
            await setUp(baseCard({ status: 'ACTIVE', replacedByCode: 'GC-000050' }), 'admin');
            expect(component.canReplace()).toBeFalse();
        });

        it('L) vendedor (no admin) + ACTIVE: false', async () => {
            await setUp(baseCard({ status: 'ACTIVE' }), 'user');
            expect(component.canReplace()).toBeFalse();
        });
    });

    describe('confirmEditAmount', () => {
        it('M) convierte bolivianos a centavos y llama al servicio con el código correcto', async () => {
            await setUp(baseCard({ status: 'AVAILABLE', amountCents: 10000 }), 'admin');
            component.openEditAmount();
            component.newAmountBs.set(500);
            component.confirmEditAmount();
            expect(updateGiftCardAmount).toHaveBeenCalledOnceWith('GC-000001', 50000);
        });

        it('N) monto sin cambios: rechazado en el cliente, nunca llama al servicio', async () => {
            await setUp(baseCard({ status: 'AVAILABLE', amountCents: 10000 }), 'admin');
            component.openEditAmount();
            expect(component.newAmountBs()).toBe(100); // precargado con el monto actual
            component.confirmEditAmount();
            expect(updateGiftCardAmount).not.toHaveBeenCalled();
        });

        it('O) error del servidor (p. ej. ya no está AVAILABLE): no crashea, no cierra', async () => {
            await setUp(baseCard({ status: 'AVAILABLE', amountCents: 10000 }), 'admin');
            updateGiftCardAmount.and.returnValue(
                throwError(() => ({ code: 'functions/failed-precondition', message: 'Solo AVAILABLE.' })),
            );
            component.openEditAmount();
            component.newAmountBs.set(500);
            expect(() => component.confirmEditAmount()).not.toThrow();
            expect(component.saving()).toBeFalse();
        });
    });

    describe('confirmReplace', () => {
        // El componente declara su PROPIO `providers: [ConfirmationService]`
        // (igual que `confirmCancel`/`confirmReactivate`, ya existentes): un
        // `TestBed.inject(ConfirmationService)` a nivel de módulo resolvería
        // una instancia DISTINTA. Se obtiene la real desde el injector del
        // propio fixture y se fuerza `accept()` de inmediato, como ya hace
        // `sales-pos.component.spec.ts` con el mismo patrón.
        const acceptImmediately = (fixture: ComponentFixture<GiftCardDetailDialogComponent>) => {
            const confirmation = fixture.debugElement.injector.get(ConfirmationService);
            spyOn(confirmation, 'confirm').and.callFake(((opts: { accept: () => void }) => opts.accept()) as never);
        };

        it('P) acepta la confirmación y llama replaceGiftCard; NO cierra el diálogo (visibleChange no emitido)', async () => {
            await setUp(baseCard({ status: 'ACTIVE', amountCents: 100000 }), 'admin');
            acceptImmediately(fixture);

            let closed = false;
            component.visibleChange.subscribe(() => (closed = true));

            component.openReplace();
            component.confirmReplace();

            expect(replaceGiftCard).toHaveBeenCalledOnceWith('GC-000001', undefined);
            expect(component.replacedResult()).toEqual({ newCardCode: 'GC-000099', amountCents: 100000 });
            expect(closed).toBeFalse();
        });

        it('Q) envía el motivo escrito (trim) cuando se completa', async () => {
            await setUp(baseCard({ status: 'ACTIVE' }), 'admin');
            acceptImmediately(fixture);

            component.openReplace();
            component.replaceReason.set('  tarjeta dañada  ');
            component.confirmReplace();

            expect(replaceGiftCard).toHaveBeenCalledOnceWith('GC-000001', 'tarjeta dañada');
        });

        it('R) printReplacementLabel abre la etiqueta de la tarjeta NUEVA, no la vieja', async () => {
            await setUp(baseCard({ status: 'ACTIVE', amountCents: 100000 }), 'admin');
            acceptImmediately(fixture);

            component.openReplace();
            component.confirmReplace();
            component.printReplacementLabel();

            expect(component.labelTarget()).toEqual({ code: 'GC-000099', amountCents: 100000 });
        });
    });
});
