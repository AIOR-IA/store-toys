import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { ToastService } from '@core/services';
import { AddExtraDialogComponent, AddedExtra } from './add-extra-dialog.component';

/**
 * Venta Extra (nueva funcionalidad): validación mínima del diálogo — nombre
 * requerido, precio > 0, cantidad entera >= 1 — y que `added` nunca emite
 * con datos inválidos (`createSale` revalida todo server-side de todas
 * formas, pero el diálogo no debe ni intentarlo).
 */
describe('AddExtraDialogComponent', () => {
    let fixture: ComponentFixture<AddExtraDialogComponent>;
    let component: AddExtraDialogComponent;
    let toastError: jasmine.Spy;
    let added: AddedExtra[];

    beforeEach(async () => {
        toastError = jasmine.createSpy('error');
        added = [];

        await TestBed.configureTestingModule({
            imports: [AddExtraDialogComponent, TranslateModule.forRoot()],
            providers: [
                provideNoopAnimations(),
                { provide: ToastService, useValue: { error: toastError } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(AddExtraDialogComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
        component.added.subscribe((e) => added.push(e));
    });

    it('D) nombre vacío: no agrega, avisa', () => {
        component.name.set('   ');
        component.priceBs.set(10);
        component.quantity.set(1);
        component.submit();

        expect(added.length).toBe(0);
        expect(toastError).toHaveBeenCalledWith('app.sales.extra.messages.nameRequired');
    });

    it('E) precio 0: no agrega, avisa', () => {
        component.name.set('Chocolate');
        component.priceBs.set(0);
        component.quantity.set(1);
        component.submit();

        expect(added.length).toBe(0);
        expect(toastError).toHaveBeenCalledWith('app.sales.extra.messages.priceRequired');
    });

    it('E2) precio negativo: no agrega, avisa', () => {
        component.name.set('Chocolate');
        component.priceBs.set(-5);
        component.quantity.set(1);
        component.submit();

        expect(added.length).toBe(0);
        expect(toastError).toHaveBeenCalledWith('app.sales.extra.messages.priceRequired');
    });

    it('F) cantidad 0: no agrega, avisa', () => {
        component.name.set('Chocolate');
        component.priceBs.set(10);
        component.quantity.set(0);
        component.submit();

        expect(added.length).toBe(0);
        expect(toastError).toHaveBeenCalledWith('app.sales.extra.messages.quantityRequired');
    });

    it('F2) cantidad no entera: no agrega, avisa', () => {
        component.name.set('Chocolate');
        component.priceBs.set(10);
        component.quantity.set(1.5);
        component.submit();

        expect(added.length).toBe(0);
        expect(toastError).toHaveBeenCalledWith('app.sales.extra.messages.quantityRequired');
    });

    it('Extra válido: emite added con los centavos correctos, cierra y limpia el formulario', () => {
        let closedWith: boolean | undefined;
        component.visibleChange.subscribe((v) => (closedWith = v));

        component.name.set('  Chocolate  ');
        component.priceBs.set(10);
        component.quantity.set(2);
        component.submit();

        expect(added).toEqual([{ name: 'Chocolate', unitPriceCents: 1000, quantity: 2 }]);
        expect(closedWith).toBeFalse();
        expect(component.name()).toBe('');
        expect(component.priceBs()).toBeNull();
        expect(component.quantity()).toBe(1); // vuelve al default, no queda en 0
        expect(toastError).not.toHaveBeenCalled();
    });

    it('cancelar: cierra y limpia sin emitir added', () => {
        component.name.set('Chocolate');
        component.priceBs.set(10);
        component.quantity.set(2);

        component.close();

        expect(added.length).toBe(0);
        expect(component.name()).toBe('');
        expect(component.priceBs()).toBeNull();
    });
});
