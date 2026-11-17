import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NEVER, of, throwError } from 'rxjs';
import { SessionService } from '@core/session';
import { ImageCompressorService, SettingsService, ToastService } from '@core/services';
import { SaleReceiptService } from '../../sale-receipt.service';
import { SalesService } from '../../sales.service';
import { Sale } from '../../sale.model';
import { SalesHistoryComponent } from './sales-history.component';

registerLocaleData(localeEs);

/**
 * Caja (efectivo/QR) de Historial de Ventas (plan §29-bis): SIEMPRE desde
 * `getSellerCashbox` — nunca de `rows()` (paginado). Vendedor forzado a su
 * propio UID; admin decide (vendedor puntual o "todos") y el backend es quien
 * resuelve el alcance real — aquí solo se verifica que el COMPONENTE pide el
 * `sellerId` correcto en cada caso y nunca confía en lo que escribiría el
 * propio usuario.
 */
describe('SalesHistoryComponent — caja por vendedor', () => {
    let fixture: ComponentFixture<SalesHistoryComponent>;
    let component: SalesHistoryComponent;
    let getSellerCashbox: jasmine.Spy;
    let pagerFirst: jasmine.Spy;

    const emptyPage = { rows: [] as Sale[], hasNext: false, hasPrev: false, total: 0 };

    function setup(session: { role: 'admin' | 'user'; uid: string }) {
        getSellerCashbox = jasmine
            .createSpy('getSellerCashbox')
            .and.returnValue(of({ cashCents: 10000, qrCents: 5000 }));
        pagerFirst = jasmine.createSpy('pagerFirst').and.returnValue(Promise.resolve(emptyPage));
        const pager = {
            first: pagerFirst,
            next: () => Promise.resolve(emptyPage),
            prev: () => Promise.resolve(emptyPage),
        };

        TestBed.configureTestingModule({
            imports: [SalesHistoryComponent, TranslateModule.forRoot()],
            providers: [
                provideRouter([]),
                provideNoopAnimations(),
                { provide: LOCALE_ID, useValue: 'es' },
                CurrencyPipe,
                {
                    provide: SalesService,
                    useValue: {
                        createPager: () => pager,
                        listSellers: () => of([{ uid: 'mariela', name: 'Mariela Flores' }, { uid: 'lenar', name: 'Lenar Lima' }]),
                        getSellerCashbox,
                    },
                },
                {
                    provide: SessionService,
                    useValue: { session: signal({ status: 'active', ...session }) },
                },
                { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
                { provide: SaleReceiptService, useValue: {} },
                { provide: SettingsService, useValue: { getSettings: () => of({}) } },
                { provide: ImageCompressorService, useValue: {} },
            ],
        });

        fixture = TestBed.createComponent(SalesHistoryComponent);
        component = fixture.componentInstance;
    }

    it('B1. vendedor: getSellerCashbox se llama SIEMPRE con su propio UID, sin sellerId elegible', () => {
        setup({ role: 'user', uid: 'mariela' });
        fixture.detectChanges();
        expect(getSellerCashbox).toHaveBeenCalledWith(jasmine.any(String), 'mariela');
    });

    it('B2. admin sin selección: sellerId llega undefined (alcance "todos")', () => {
        setup({ role: 'admin', uid: 'admin1' });
        fixture.detectChanges();
        expect(getSellerCashbox).toHaveBeenCalledWith(jasmine.any(String), undefined);
    });

    it('B3. admin selecciona un vendedor: sellerId es exactamente el elegido', () => {
        setup({ role: 'admin', uid: 'admin1' });
        fixture.detectChanges();
        getSellerCashbox.calls.reset();
        component.onSellerChange('lenar');
        expect(getSellerCashbox).toHaveBeenCalledWith(jasmine.any(String), 'lenar');
    });

    it('B4. cambio de fecha dispara un nuevo resumen con el nuevo dateKey', () => {
        setup({ role: 'user', uid: 'mariela' });
        fixture.detectChanges();
        getSellerCashbox.calls.reset();
        component.onDateChange(new Date('2026-01-05T12:00:00'));
        expect(getSellerCashbox).toHaveBeenCalledTimes(1);
        expect(getSellerCashbox.calls.mostRecent().args[0]).not.toBe('');
    });

    it('B5. cambio de vendedor (admin) dispara un nuevo resumen', () => {
        setup({ role: 'admin', uid: 'admin1' });
        fixture.detectChanges();
        getSellerCashbox.calls.reset();
        component.onSellerChange('mariela');
        expect(getSellerCashbox).toHaveBeenCalledTimes(1);
    });

    it('B6. cambiar de página NO vuelve a pedir el resumen ni cambia su alcance', async () => {
        setup({ role: 'admin', uid: 'admin1' });
        fixture.detectChanges();
        getSellerCashbox.calls.reset();
        await component.onNextPage();
        await component.onPrevPage();
        component.onPageSizeChange(15);
        expect(getSellerCashbox).not.toHaveBeenCalled();
    });

    it('B7. loading: el valor anterior se oculta (cashbox() vuelve a null) hasta que llega el nuevo', () => {
        setup({ role: 'user', uid: 'mariela' });
        fixture.detectChanges();
        expect(component.cashbox()).toEqual({ cashCents: 10000, qrCents: 5000 });

        // la próxima llamada tarda — mientras no resuelva, no debe mostrarse el valor anterior
        getSellerCashbox.and.returnValue(NEVER);
        component.onDateChange(new Date('2026-02-01T12:00:00'));
        expect(component.cashbox()).toBeNull();
        expect(component.cashboxLoading()).toBeTrue();
    });

    it('B8. error en getSellerCashbox: la tabla sigue funcionando y no se muestra 0,00 Bs', async () => {
        setup({ role: 'user', uid: 'mariela' });
        getSellerCashbox.and.returnValue(throwError(() => new Error('network')));
        fixture.detectChanges();
        await fixture.whenStable();
        expect(component.cashboxError()).toBeTrue();
        expect(component.cashbox()).toBeNull();
        // la tabla no se ve afectada por el error del resumen
        expect(pagerFirst).toHaveBeenCalled();
        expect(component.hasLoadedOnce()).toBeTrue();
    });

    it('B9. formatea cash/qr con el mismo MoneyPipe de siempre (100,00 Bs / 50,00 Bs)', () => {
        setup({ role: 'user', uid: 'mariela' });
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('100,00');
        expect(text).toContain('50,00');
    });
});
