import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ToastService } from '@core/services';
import { ProductsService } from '../../products.service';
import { ProductCodePickerComponent, ResolvedCode } from './product-code-picker.component';

/**
 * Lector HID en «Código de fabricante». El lector escribe el código y manda
 * Enter: ese Enter NO debe enviar nada, y el texto queda seleccionado para que
 * la siguiente lectura lo reemplace en vez de concatenarse.
 */
describe('ProductCodePickerComponent — lector HID', () => {
    const A = '7791234567890';
    const B = '7791234567891';

    let fixture: ComponentFixture<ProductCodePickerComponent>;
    let component: ProductCodePickerComponent;
    let generateInternalCode: jasmine.Spy;
    let emitted: (ResolvedCode | null)[];

    const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input');

    /** Lo que hace el navegador al teclear o pegar: cambia el valor y dispara `input`. */
    const type = (value: string) => {
        const el = input();
        el.value = value;
        el.dispatchEvent(new Event('input'));
        fixture.detectChanges();
    };

    /** Enter del lector. Devuelve el evento para comprobar `defaultPrevented`. */
    const pressEnter = (): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
        input().dispatchEvent(event);
        fixture.detectChanges();
        return event;
    };

    beforeEach(async () => {
        generateInternalCode = jasmine.createSpy('generateInternalCode').and.returnValue(of('MP000001'));
        await TestBed.configureTestingModule({
            imports: [ProductCodePickerComponent, TranslateModule.forRoot()],
            providers: [
                provideNoopAnimations(),
                { provide: ProductsService, useValue: { generateInternalCode } },
                { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(ProductCodePickerComponent);
        component = fixture.componentInstance;
        emitted = [];
        component.resolvedChange.subscribe((value) => emitted.push(value));
        component.selectManufacturer();
        fixture.detectChanges();
    });

    it('A) una lectura + Enter deja el código correcto confirmado', () => {
        type(A);
        pressEnter();
        expect(component.resolved()).toEqual({ code: A, codeSource: 'manufacturer' });
        expect(emitted.at(-1)).toEqual({ code: A, codeSource: 'manufacturer' });
        expect(input().value).toBe(A);
    });

    it('B) después de Enter el contenido queda seleccionado completo', () => {
        type(A);
        pressEnter();
        expect(input().selectionStart).toBe(0);
        expect(input().selectionEnd).toBe(A.length);
    });

    it('C) Enter no envía el formulario, no genera código interno y no cambia el modo', () => {
        type(A);
        const event = pressEnter();
        expect(event.defaultPrevented).toBeTrue();
        expect(generateInternalCode).not.toHaveBeenCalled();
        expect(component.mode()).toBe('manufacturer');
    });

    it('D) A → Enter → B → Enter termina en B, no en AB', () => {
        type(A);
        pressEnter();
        // Con la selección completa, la primera tecla de B reemplaza a A:
        // el navegador entrega el valor ya reemplazado, no la concatenación.
        type(B);
        pressEnter();
        expect(input().value).toBe(B);
        expect(component.resolved()?.code).toBe(B);
        expect(input().value).not.toBe(A + B);
    });

    it('E) A → Enter → A otra vez deja A visible y seleccionado (el rebote no cambia nada)', () => {
        type(A);
        pressEnter();
        type(A);
        pressEnter();
        expect(input().value).toBe(A);
        expect(component.resolved()?.code).toBe(A);
        expect(input().selectionEnd).toBe(A.length);
    });

    it('F) escritura manual sin Enter sigue siendo editable y actualiza el código', () => {
        type('779');
        expect(component.resolved()?.code).toBe('779');
        type('7791');
        expect(component.resolved()?.code).toBe('7791');
        type('77912'); // editar: sin Enter, el valor es el que quedó en el campo
        expect(input().value).toBe('77912');
        expect(component.resolved()?.code).toBe('77912');
    });

    it('G) pegar un código completo sin Enter lo toma tal cual', () => {
        type(A);
        expect(component.resolved()?.code).toBe(A);
        expect(input().selectionStart).toBe(input().value.length); // el input no se toca al pegar
    });

    it('H) Enter sin código no emite nada válido', () => {
        pressEnter();
        expect(component.resolved()).toBeNull();
        expect(emitted.at(-1)).toBeNull();
    });
});
