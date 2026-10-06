import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurrencyPipe } from '@angular/common';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ToastService } from '@core/services';
import { GiftCardsService } from '../../gift-cards.service';
import { GiftCardRegisterDialogComponent } from './gift-card-register-dialog.component';

/**
 * Registro manual de una tarjeta física con lector HID: Enter cierra la lectura
 * SIN registrar, y el texto queda seleccionado para que la siguiente lectura lo
 * reemplace (antes se concatenaban dos lecturas en un código inválido).
 */
describe('GiftCardRegisterDialogComponent — código manual con lector HID', () => {
    const A = 'GC100-001';
    const B = 'GC100-002';

    let fixture: ComponentFixture<GiftCardRegisterDialogComponent>;
    let component: GiftCardRegisterDialogComponent;
    let registerGiftCard: jasmine.Spy;

    const codeInput = (): HTMLInputElement => fixture.nativeElement.querySelector('#code');

    const type = (value: string) => {
        const el = codeInput();
        el.value = value;
        el.dispatchEvent(new Event('input'));
        fixture.detectChanges();
    };

    const pressEnter = (): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
        codeInput().dispatchEvent(event);
        fixture.detectChanges();
        return event;
    };

    beforeEach(async () => {
        registerGiftCard = jasmine.createSpy('registerGiftCard').and.returnValue(of(undefined));
        await TestBed.configureTestingModule({
            imports: [GiftCardRegisterDialogComponent, TranslateModule.forRoot()],
            providers: [
                provideNoopAnimations(),
                CurrencyPipe,
                {
                    provide: GiftCardsService,
                    useValue: {
                        registerGiftCard,
                        registerGiftCardBatch: jasmine.createSpy('registerGiftCardBatch'),
                        generateGiftCard: jasmine.createSpy('generateGiftCard'),
                        generateGiftCardBatch: jasmine.createSpy('generateGiftCardBatch'),
                    },
                },
                { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(GiftCardRegisterDialogComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
    });

    it('A) una lectura + Enter: el código queda visible y NO se registra', () => {
        type(A);
        pressEnter();
        expect(codeInput().value).toBe(A);
        expect(component.code()).toBe(A);
        expect(registerGiftCard).not.toHaveBeenCalled();
    });

    it('B) doble lectura del mismo código no concatena: queda A', () => {
        type(A);
        pressEnter();
        type(A); // la segunda lectura reemplaza la selección completa
        pressEnter();
        expect(component.code()).toBe(A);
        expect(component.code()).not.toBe(A + A);
    });

    it('C) A → B: B reemplaza a A y es el que se registra', () => {
        component.amountBs.set(100);
        type(A);
        pressEnter();
        type(B);
        pressEnter();
        component.submit();
        expect(registerGiftCard).toHaveBeenCalledOnceWith(B, 10000);
    });

    it('D) Enter deja el texto seleccionado y no envía el formulario', () => {
        type(A);
        const event = pressEnter();
        expect(event.defaultPrevented).toBeTrue();
        expect(codeInput().selectionStart).toBe(0);
        expect(codeInput().selectionEnd).toBe(A.length);
    });

    it('E) escritura manual sigue funcionando (teclear, borrar, editar)', () => {
        type('GC1');
        type('GC10');
        type('GC100');
        type('GC10'); // Backspace
        type('GC101'); // editar el último dígito
        expect(component.code()).toBe('GC101');
        expect(codeInput().value).toBe('GC101');
    });
});
