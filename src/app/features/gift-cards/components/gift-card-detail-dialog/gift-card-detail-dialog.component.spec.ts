import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurrencyPipe } from '@angular/common';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmationService } from 'primeng/api';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { SessionService } from '@core/session';
import { ToastService } from '@core/services';
import { GiftCardReceiptService } from '../../gift-card-receipt.service';
import { GiftCard } from '../../gift-card.model';
import { GiftCardsService } from '../../gift-cards.service';
import { GiftCardDetailDialogComponent } from './gift-card-detail-dialog.component';

/**
 * Identidad ≠ monto (ajuste posterior, plan §16.13): "Editar monto" solo
 * para admin + AVAILABLE.
 *
 * "Reemplazar" — regla de flujo DEFINITIVA (segundo ajuste posterior): YA NO
 * es directo desde `ACTIVE`/`SUSPENDED`. Solo es elegible una tarjeta
 * `CANCELLED` con `pendingReplacement === true` (quedó así al cancelarse
 * con un ciclo pagado abierto) y que todavía no se haya reemplazado
 * (`replacedByCode` sigue `null`). La elegibilidad server-side es la real
 * (ver `functions/src/giftcards.ts`); aquí se prueba que el frontend
 * refleja EXACTAMENTE el mismo criterio, para no mostrar una acción que la
 * Function de todas formas rechazaría.
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
    let cancelGiftCard: jasmine.Spy;
    let lookupByCode: jasmine.Spy;
    let activateGiftCard: jasmine.Spy;
    let getIssueReceipt: jasmine.Spy;
    let printReceipt: jasmine.Spy;
    let getIssue: jasmine.Spy;
    let createPager: jasmine.Spy;
    let pagerSpy: { first: jasmine.Spy; next: jasmine.Spy; prev: jasmine.Spy };

    const makeTarget = (overrides: Partial<GiftCard> = {}): GiftCard =>
        baseCard({ cardCode: 'GC-TARGET', status: 'AVAILABLE', amountCents: 5000, ...overrides });

    const setUp = async (card: GiftCard, role: 'admin' | 'user' = 'admin') => {
        sessionRole.set({ status: 'active', role });
        updateGiftCardAmount = jasmine.createSpy('updateGiftCardAmount').and.returnValue(
            of({ cardCode: card.cardCode, amountCents: 0 }),
        );
        replaceGiftCard = jasmine.createSpy('replaceGiftCard').and.returnValue(
            of({ cardCode: card.cardCode, newCardCode: 'GC-000099', amountCents: card.amountCents }),
        );
        cancelGiftCard = jasmine.createSpy('cancelGiftCard').and.returnValue(of({ cardCode: card.cardCode }));
        lookupByCode = jasmine.createSpy('lookupByCode').and.returnValue(of(null));
        activateGiftCard = jasmine
            .createSpy('activateGiftCard')
            .and.returnValue(of({ cardCode: card.cardCode, cycleId: 'cyc-new', cycleNumber: 1 }));
        getIssueReceipt = jasmine.createSpy('getIssueReceipt').and.returnValue(
            of({
                id: 'cyc-new',
                cardCode: card.cardCode,
                cycleNumber: 1,
                amountCents: card.amountCents,
                buyerName: null,
                activatedAt: timestamp(),
                activatedByName: 'Vendedor',
                dateKey: '2026-10-24',
                payments: [{ method: 'cash', amountCents: card.amountCents }],
            }),
        );
        printReceipt = jasmine.createSpy('print').and.returnValue(Promise.resolve());
        getIssue = jasmine.createSpy('getIssue').and.returnValue(of(null));
        pagerSpy = {
            first: jasmine.createSpy('first').and.returnValue(
                Promise.resolve({ rows: [], hasNext: false, hasPrev: false, total: 0 }),
            ),
            next: jasmine.createSpy('next').and.returnValue(
                Promise.resolve({ rows: [], hasNext: false, hasPrev: false, total: 0 }),
            ),
            prev: jasmine.createSpy('prev').and.returnValue(
                Promise.resolve({ rows: [], hasNext: false, hasPrev: false, total: 0 }),
            ),
        };
        createPager = jasmine.createSpy('createPager').and.returnValue(pagerSpy);

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
                        cancelGiftCard,
                        lookupByCode,
                        activateGiftCard,
                        getIssueReceipt,
                        getIssue,
                        createPager,
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
                { provide: GiftCardReceiptService, useValue: { print: printReceipt } },
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

    describe('canReplace — regla de flujo definitiva: solo CANCELLED + pendingReplacement', () => {
        it('E) admin + ACTIVE: false (ya NO es directo — hay que cancelar primero)', async () => {
            await setUp(baseCard({ status: 'ACTIVE' }), 'admin');
            expect(component.canReplace()).toBeFalse();
        });

        it('F) admin + SUSPENDED: false (ya NO es directo — hay que cancelar primero)', async () => {
            await setUp(baseCard({ status: 'SUSPENDED' }), 'admin');
            expect(component.canReplace()).toBeFalse();
        });

        it('G) admin + CANCELLED con pendingReplacement + sin replacedByCode: true', async () => {
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

        it('K) CANCELLED + pendingReplacement pero YA con replacedByCode: false (ya fue reemplazada)', async () => {
            await setUp(
                baseCard({ status: 'CANCELLED', pendingReplacement: true, replacedByCode: 'GC-000050' }),
                'admin',
            );
            expect(component.canReplace()).toBeFalse();
        });

        it('L) vendedor (no admin) + CANCELLED + pendingReplacement: false', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'user');
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
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true, amountCents: 100000 }), 'admin');
            acceptImmediately(fixture);

            let closed = false;
            component.visibleChange.subscribe(() => (closed = true));

            component.openReplace();
            component.confirmReplace();

            expect(replaceGiftCard).toHaveBeenCalledOnceWith('GC-000001', {
                reason: undefined,
                mode: 'generate',
                targetCode: undefined,
            });
            expect(component.replacedResult()).toEqual({ newCardCode: 'GC-000099', amountCents: 100000 });
            expect(closed).toBeFalse();
        });

        it('Q) envía el motivo escrito (trim) cuando se completa', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            acceptImmediately(fixture);

            component.openReplace();
            component.replaceReason.set('  tarjeta dañada  ');
            component.confirmReplace();

            expect(replaceGiftCard).toHaveBeenCalledOnceWith('GC-000001', {
                reason: 'tarjeta dañada',
                mode: 'generate',
                targetCode: undefined,
            });
        });

        it('R) printReplacementLabel abre la etiqueta de la tarjeta NUEVA, no la vieja', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true, amountCents: 100000 }), 'admin');
            acceptImmediately(fixture);

            component.openReplace();
            component.confirmReplace();
            component.printReplacementLabel();

            expect(component.labelTarget()).toEqual({ code: 'GC-000099', amountCents: 100000 });
        });
    });

    /**
     * Segundo modo de reemplazo — "Usar tarjeta existente" (ajuste
     * posterior, prompt §39, letras A-R). El servidor es la fuente de
     * verdad de la elegibilidad/transacción (ver `tests/functions/
     * sales.harness.js`, sección W); aquí solo se prueba que el FRONTEND
     * ofrece los dos modos, pagina/selecciona correctamente, nunca permite
     * confirmar sin selección, y manda exactamente lo que el servidor
     * espera.
     */
    describe('reemplazo — modo "Usar tarjeta existente"', () => {
        const flush = () => new Promise((r) => setTimeout(r));

        const acceptImmediately = (fixture: ComponentFixture<GiftCardDetailDialogComponent>) => {
            const confirmation = fixture.debugElement.injector.get(ConfirmationService);
            spyOn(confirmation, 'confirm').and.callFake(((opts: { accept: () => void }) => opts.accept()) as never);
        };

        it('A) el panel ofrece los dos modos, "generate" por defecto', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            component.openReplace();
            expect(component.replaceMode()).toBe('generate');
        });

        it('B) modo "generate" no carga el selector (conserva la UI actual)', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            component.openReplace();
            expect(createPager).not.toHaveBeenCalled();
        });

        it('C) cambiar a "existing" pide SOLO tarjetas AVAILABLE, 5 por página', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            component.openReplace();
            component.onReplaceModeChange('existing');
            await flush();

            expect(createPager).toHaveBeenCalledOnceWith('AVAILABLE', 5);
        });

        it('D) muestra las filas que devuelve el pager', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            const t1 = makeTarget({ cardCode: 'GC-000050' });
            pagerSpy.first.and.returnValue(Promise.resolve({ rows: [t1], hasNext: false, hasPrev: false, total: 1 }));
            component.openReplace();
            component.onReplaceModeChange('existing');
            await flush();

            expect(component.availableTargets()).toEqual([t1]);
        });

        it('E) selección única: elegir otra tarjeta reemplaza la anterior', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            const t1 = makeTarget({ cardCode: 'GC-000050' });
            const t2 = makeTarget({ cardCode: 'GC-000051' });

            component.selectTarget(t1);
            expect(component.selectedTarget()).toEqual(t1);
            component.selectTarget(t2);
            expect(component.selectedTarget()).toEqual(t2);
        });

        it('F) elegir la MISMA tarjeta otra vez la deselecciona (toggle)', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            const t1 = makeTarget({ cardCode: 'GC-000050' });

            component.selectTarget(t1);
            component.selectTarget(t1);
            expect(component.selectedTarget()).toBeNull();
        });

        it('G) "Quitar selección" limpia la selección', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            component.selectTarget(makeTarget());
            component.clearTargetSelection();
            expect(component.selectedTarget()).toBeNull();
        });

        it('H) sin selección, confirmar no llama al servicio y avisa', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            component.openReplace();
            component.onReplaceModeChange('existing');
            await flush();
            component.confirmReplace();

            expect(replaceGiftCard).not.toHaveBeenCalled();
        });

        it('I) con selección, confirma y manda mode="existing" + targetCode', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true, amountCents: 100000 }), 'admin');
            acceptImmediately(fixture);
            component.openReplace();
            component.onReplaceModeChange('existing');
            await flush();

            const target = makeTarget({ cardCode: 'GC-000050' });
            component.selectTarget(target);
            component.confirmReplace();

            expect(replaceGiftCard).toHaveBeenCalledOnceWith('GC-000001', {
                reason: undefined,
                mode: 'existing',
                targetCode: 'GC-000050',
            });
        });

        it('J) la confirmación pide el texto con el código ORIGEN y el código DESTINO elegido como parámetros', async () => {
            // `TranslateModule.forRoot()` sin loader no interpola (mismo criterio que el
            // resto de specs de este repo): se verifica que `instant` se llamó con la
            // clave y los parámetros correctos, no el texto ya traducido.
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            const confirmation = fixture.debugElement.injector.get(ConfirmationService);
            spyOn(confirmation, 'confirm').and.callFake(((opts: { accept: () => void }) => opts.accept()) as never);
            const translate = fixture.debugElement.injector.get(TranslateService);
            const instantSpy = spyOn(translate, 'instant').and.callThrough();

            component.openReplace();
            component.onReplaceModeChange('existing');
            await flush();
            component.selectTarget(makeTarget({ cardCode: 'GC-000050' }));
            component.confirmReplace();

            expect(instantSpy).toHaveBeenCalledWith('app.giftCards.messages.confirmReplaceExisting', {
                sourceCode: 'GC-000001',
                targetCode: 'GC-000050',
            });
        });

        it('K) previsualiza lo que el destino heredará (comprador/vendedor del ciclo ORIGINAL, vía getIssue)', async () => {
            await setUp(
                baseCard({ status: 'CANCELLED', pendingReplacement: true, lastCycleId: 'cyc-orig' }),
                'admin',
            );
            getIssue.and.returnValue(
                of({
                    id: 'cyc-orig',
                    buyerName: 'Camila',
                    activatedByName: 'Lenar Lima',
                } as never),
            );
            component.openReplace();
            await flush();

            expect(getIssue).toHaveBeenCalledOnceWith('cyc-orig');
            expect(component.sourceOriginalIssue()?.buyerName).toBe('Camila');
            expect(component.sourceOriginalIssue()?.activatedByName).toBe('Lenar Lima');
        });

        it('L) datos heredados no son inputs editables: no existe ningún setter de monto/comprador para el destino', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            // El componente no expone ninguna señal de "monto/comprador del destino" escribible —
            // lo único escribible por el usuario en este modo es la SELECCIÓN de la tarjeta.
            expect((component as unknown as Record<string, unknown>)['targetAmountBs']).toBeUndefined();
            expect((component as unknown as Record<string, unknown>)['targetBuyerName']).toBeUndefined();
        });

        it('M) éxito: mismo panel de resultado que el modo "generate" (código + monto, sin ofrecer recibo)', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true, amountCents: 100000 }), 'admin');
            acceptImmediately(fixture);
            replaceGiftCard.and.returnValue(of({ cardCode: 'GC-000001', newCardCode: 'GC-000050', amountCents: 100000 }));

            component.openReplace();
            component.onReplaceModeChange('existing');
            await flush();
            component.selectTarget(makeTarget({ cardCode: 'GC-000050' }));
            component.confirmReplace();

            expect(component.replacedResult()).toEqual({ newCardCode: 'GC-000050', amountCents: 100000 });
        });

        it('N) error del servidor (carrera: ya no está AVAILABLE) limpia la selección y refresca el listado', async () => {
            await setUp(baseCard({ status: 'CANCELLED', pendingReplacement: true }), 'admin');
            acceptImmediately(fixture);
            replaceGiftCard.and.returnValue(
                throwError(() => ({
                    code: 'functions/failed-precondition',
                    message: 'La tarjeta seleccionada ya no está disponible. Selecciona otra tarjeta.',
                })),
            );

            component.openReplace();
            component.onReplaceModeChange('existing');
            await flush();
            component.selectTarget(makeTarget({ cardCode: 'GC-000050' }));
            createPager.calls.reset();
            component.confirmReplace();

            expect(component.selectedTarget()).toBeNull();
            expect(createPager).toHaveBeenCalledOnceWith('AVAILABLE', 5);
            expect(component.mode()).toBe('replace'); // sigue abierto, nunca se cierra en silencio
        });
    });

    describe('confirmCancel — el detalle se refresca en el sitio (prompt §11)', () => {
        const acceptImmediately = (fixture: ComponentFixture<GiftCardDetailDialogComponent>) => {
            const confirmation = fixture.debugElement.injector.get(ConfirmationService);
            spyOn(confirmation, 'confirm').and.callFake(((opts: { accept: () => void }) => opts.accept()) as never);
        };

        it('S) cancelar una ACTIVE con ciclo pagado: NO cierra el diálogo, y tras refrescar "Reemplazar" aparece sin reabrir', async () => {
            const active = baseCard({ status: 'ACTIVE', amountCents: 25000 });
            await setUp(active, 'admin');
            acceptImmediately(fixture);
            expect(component.canReplace()).toBeFalse(); // todavía ACTIVE: no se puede reemplazar directo

            const cancelled = baseCard({ status: 'CANCELLED', pendingReplacement: true, amountCents: 25000 });
            lookupByCode.and.returnValue(of(cancelled));

            let closed = false;
            component.visibleChange.subscribe(() => (closed = true));

            component.openCancel();
            component.cancelReason.set('tarjeta dañada');
            component.confirmCancel();

            expect(cancelGiftCard).toHaveBeenCalledOnceWith('GC-000001', 'tarjeta dañada');
            expect(lookupByCode).toHaveBeenCalledOnceWith('GC-000001');
            expect(closed).toBeFalse(); // sigue abierto, sin cerrar y reabrir a mano
            expect(component.displayCard()?.status).toBe('CANCELLED');
            expect(component.canReplace()).toBeTrue(); // ahora SÍ, sin recargar el diálogo
            expect(component.mode()).toBe('view');
        });

        it('T) cancelar una AVAILABLE (nunca vendida): se refresca, pero "Reemplazar" sigue sin aparecer', async () => {
            const available = baseCard({ status: 'AVAILABLE', amountCents: 25000 });
            await setUp(available, 'admin');
            acceptImmediately(fixture);

            const cancelled = baseCard({ status: 'CANCELLED', pendingReplacement: false, amountCents: 25000 });
            lookupByCode.and.returnValue(of(cancelled));

            component.openCancel();
            component.cancelReason.set('nunca se usó');
            component.confirmCancel();

            expect(component.displayCard()?.status).toBe('CANCELLED');
            expect(component.canReplace()).toBeFalse();
        });

        it('U) la refrescada se limpia si se abre otra tarjeta (el override no se "pega" entre tarjetas)', async () => {
            const active = baseCard({ status: 'ACTIVE', amountCents: 25000 });
            await setUp(active, 'admin');
            acceptImmediately(fixture);
            lookupByCode.and.returnValue(of(baseCard({ status: 'CANCELLED', pendingReplacement: true })));

            component.openCancel();
            component.cancelReason.set('x');
            component.confirmCancel();
            expect(component.displayCard()?.status).toBe('CANCELLED');

            const otherCard = baseCard({ cardCode: 'GC-000777', status: 'ACTIVE' });
            fixture.componentRef.setInput('card', otherCard);
            fixture.detectChanges();

            expect(component.displayCard()).toEqual(otherCard);
        });
    });

    /**
     * Recibo inmediato tras vender (ajuste posterior, Recibo/Historial de
     * Gift Cards, prompt §4, §16, §21): mismo patrón de "no cerrar y mostrar
     * un resultado" que `confirmReplace` arriba.
     */
    describe('confirmActivate — recibo inmediato (no cierra, permite imprimir)', () => {
        const flush = () => new Promise((r) => setTimeout(r));

        it('V) al vender con éxito: NO cierra el diálogo y relee el recibo real vía getIssueReceipt(cycleId)', async () => {
            await setUp(baseCard({ status: 'AVAILABLE', amountCents: 50000 }), 'admin');

            let closed = false;
            component.visibleChange.subscribe(() => (closed = true));

            component.openActivate();
            component.buyerName.set('Camila');
            component.activatePaymentMethod.set('qr');
            component.confirmActivate();
            await flush();

            expect(activateGiftCard).toHaveBeenCalledOnceWith({
                code: 'GC-000001',
                buyerName: 'Camila',
                payments: [{ method: 'qr', amountCents: 50000 }],
            });
            expect(getIssueReceipt).toHaveBeenCalledOnceWith('cyc-new');
            expect(closed).toBeFalse();
            expect(component.activatedReceipt()?.id).toBe('cyc-new');
        });

        it('W) imprimir recibo llama al MISMO GiftCardReceiptService.print con el snapshot recién leído', async () => {
            await setUp(baseCard({ status: 'AVAILABLE', amountCents: 50000 }), 'admin');

            component.openActivate();
            component.confirmActivate();
            await flush();

            component.printActivatedReceipt();
            expect(printReceipt).toHaveBeenCalledOnceWith(component.activatedReceipt());
        });

        it('X) no bloquea la venta si la relectura del recibo falla: la venta ya está completa, solo se cierra', async () => {
            await setUp(baseCard({ status: 'AVAILABLE', amountCents: 50000 }), 'admin');
            getIssueReceipt.and.returnValue(throwError(() => new Error('network')));

            let closed = false;
            component.visibleChange.subscribe(() => (closed = true));

            component.openActivate();
            expect(() => component.confirmActivate()).not.toThrow();
            await flush();

            expect(closed).toBeTrue();
        });
    });
});
