import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurrencyPipe } from '@angular/common';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { SessionService } from '@core/session';
import { ToastService } from '@core/services';
import { SAME_BARCODE_DEBOUNCE_MS } from '@shared/constants';
import { GiftCard } from '../../gift-card.model';
import { GiftCardsService } from '../../gift-cards.service';
import { GiftCardListComponent } from './gift-card-list.component';

/**
 * Búsqueda por código con lector HID: un código ya buscado dentro de la ventana
 * no vuelve a consultar, y un código distinto busca de inmediato. Un código
 * concatenado accidental no debe reemplazar la lista por la primera página.
 */
describe('GiftCardListComponent — búsqueda por código con lector', () => {
    const A = 'GC100-001';
    const B = 'GC100-002';
    const card = { cardCode: A, amountCents: 10000, status: 'AVAILABLE' } as unknown as GiftCard;

    let fixture: ComponentFixture<GiftCardListComponent>;
    let component: GiftCardListComponent;
    let lookupByCode: jasmine.Spy;

    beforeEach(async () => {
        jasmine.clock().install();
        jasmine.clock().mockDate(new Date(0));

        lookupByCode = jasmine
            .createSpy('lookupByCode')
            .and.callFake((code: string) => of(code === A ? card : null));
        const pager = {
            first: () => Promise.resolve({ rows: [card], hasNext: false, hasPrev: false, total: 1 }),
            next: () => Promise.resolve({ rows: [], hasNext: false, hasPrev: false, total: 0 }),
            prev: () => Promise.resolve({ rows: [], hasNext: false, hasPrev: false, total: 0 }),
        };

        await TestBed.configureTestingModule({
            imports: [GiftCardListComponent, TranslateModule.forRoot()],
            providers: [
                provideRouter([]),
                provideNoopAnimations(),
                CurrencyPipe,
                {
                    provide: GiftCardsService,
                    useValue: {
                        createPager: () => pager,
                        listAllForSummary: () => of([]),
                        lookupByCode,
                    },
                },
                {
                    provide: SessionService,
                    useValue: { session: signal({ status: 'active', role: 'admin' }) },
                },
                { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(GiftCardListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        lookupByCode.calls.reset();
    });

    afterEach(() => jasmine.clock().uninstall());

    it('E) A con Enter dispara una sola búsqueda de A', () => {
        component.onSearch(A);
        expect(lookupByCode).toHaveBeenCalledOnceWith(A);
        expect(component.singleResultMode()).toBeTrue();
    });

    it('F) un segundo A antes de la ventana no vuelve a buscar y conserva la tarjeta', () => {
        component.onSearch(A);
        jasmine.clock().tick(SAME_BARCODE_DEBOUNCE_MS - 1);
        component.onSearch(A);
        expect(lookupByCode).toHaveBeenCalledTimes(1);
        expect(component.rows()).toEqual([card]);
        expect(component.singleResultMode()).toBeTrue();
    });

    it('F2) un A otra vez pasada la ventana sí vuelve a buscar', () => {
        component.onSearch(A);
        jasmine.clock().tick(SAME_BARCODE_DEBOUNCE_MS);
        component.onSearch(A);
        expect(lookupByCode).toHaveBeenCalledTimes(2);
    });

    it('G) B dentro de la ventana busca B de inmediato (debounce por código)', () => {
        component.onSearch(A);
        jasmine.clock().tick(200);
        component.onSearch(B);
        expect(lookupByCode).toHaveBeenCalledTimes(2);
        expect(lookupByCode.calls.mostRecent().args[0]).toBe(B);
    });

    it('H) el término buscado termina siendo B, nunca AB', () => {
        component.onSearch(A);
        jasmine.clock().tick(200);
        component.onSearch(B);
        expect(component.searchTerm()).toBe(B);
        expect(lookupByCode).not.toHaveBeenCalledWith(A + B);
    });
});
