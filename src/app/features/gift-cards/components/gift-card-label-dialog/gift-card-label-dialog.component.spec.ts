import { CurrencyPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { GiftCardLabelDialogComponent } from './gift-card-label-dialog.component';

/**
 * Identidad ≠ monto (ajuste posterior, prompt §33, §52): la etiqueta FÍSICA
 * ya no imprime el monto — antes `print()` pasaba `secondaryText` con el
 * importe a `printBarcodeLabel`, que lo escribe literalmente en el papel.
 * `printBarcodeLabel` es una función exportada simple (no un método de
 * clase): no hay forma confiable de espiarla en este build (mismo límite ya
 * confirmado con los named exports de `@angular/fire`), así que esta prueba
 * se queda en lo verificable desde fuera: el diálogo YA NO muestra el monto
 * como si fuera parte de la etiqueta, solo como dato informativo aclarado
 * como "no se imprime".
 */
describe('GiftCardLabelDialogComponent — el monto ya NO se imprime en la etiqueta física', () => {
    let fixture: ComponentFixture<GiftCardLabelDialogComponent>;
    let component: GiftCardLabelDialogComponent;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [GiftCardLabelDialogComponent, TranslateModule.forRoot()],
            providers: [provideNoopAnimations(), MessageService, CurrencyPipe],
        }).compileComponents();

        fixture = TestBed.createComponent(GiftCardLabelDialogComponent);
        component = fixture.componentInstance;
    });

    it('A) con un target, el texto aclara que el monto NO se imprime en la etiqueta', () => {
        fixture.componentRef.setInput('target', { code: 'GC-000001', amountCents: 10000 });
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('app.giftCards.labels.amountNotPrinted');
    });

    it('B) sin target, el diálogo no está visible', () => {
        fixture.detectChanges();
        expect(component.visible()).toBeFalse();
    });

    it('C) close() emite closed', () => {
        const spy = jasmine.createSpy('closed');
        component.closed.subscribe(spy);
        component.close();
        expect(spy).toHaveBeenCalled();
    });

    it('D) print() sin target no hace nada (no revienta)', async () => {
        await expectAsync(component.print()).toBeResolved();
    });
});
