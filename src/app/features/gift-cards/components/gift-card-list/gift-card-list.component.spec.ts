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

/**
 * Filtro de monto (ajuste posterior — corrección de bug: "TODAS + 20 Bs"
 * devolvía cero). El filtro SIEMPRE se basa en `amountCents`, nunca en el
 * código — por eso el catálogo incluye códigos históricos (`GC100-007`,
 * `GC20-001`) con montos que NO coinciden con lo que su propio código
 * sugeriría, y códigos manuales (`ABCD1234XYZ`, `000012345`).
 *
 * El pager (`rows()`) deliberadamente devuelve una página VACÍA en todos
 * estos tests: así, si `visibleRows` todavía filtrara sobre `rows()` (la
 * causa raíz del bug original) en vez de sobre `summary()`, estos tests
 * fallarían. Que pasen prueba que el filtro ya no depende de qué página
 * tenga cargado el paginador de cursores.
 */
describe('GiftCardListComponent — filtro de monto (bug "TODAS + monto" → cero resultados)', () => {
    const AMOUNT_20 = 2000;
    const AMOUNT_50 = 5000;
    const AMOUNT_500 = 50000;
    const AMOUNT_NONEXISTENT = 999999;

    const cAvailable20 = { cardCode: 'GC-000001', amountCents: AMOUNT_20, status: 'AVAILABLE' } as unknown as GiftCard;
    const cActive20 = { cardCode: 'GC-000002', amountCents: AMOUNT_20, status: 'ACTIVE' } as unknown as GiftCard;
    const cSuspended20 = { cardCode: 'GC-000003', amountCents: AMOUNT_20, status: 'SUSPENDED' } as unknown as GiftCard;
    const cCancelled20 = { cardCode: 'GC-000004', amountCents: AMOUNT_20, status: 'CANCELLED' } as unknown as GiftCard;
    // Histórico: el código sugiere "100" pero el monto ACTUAL es Bs 50 — nunca se infiere del código.
    const cHistorical50 = { cardCode: 'GC100-007', amountCents: AMOUNT_50, status: 'AVAILABLE' } as unknown as GiftCard;
    const cManualLetters20 = { cardCode: 'ABCD1234XYZ', amountCents: AMOUNT_20, status: 'AVAILABLE' } as unknown as GiftCard;
    const cManualDigits20 = { cardCode: '000012345', amountCents: AMOUNT_20, status: 'AVAILABLE' } as unknown as GiftCard;
    // H) la trampa exacta del prompt: el código dice "20" pero el monto actual es Bs 500.
    const cTrap500 = { cardCode: 'GC20-001', amountCents: AMOUNT_500, status: 'AVAILABLE' } as unknown as GiftCard;

    const catalog: GiftCard[] = [
        cAvailable20,
        cActive20,
        cSuspended20,
        cCancelled20,
        cHistorical50,
        cManualLetters20,
        cManualDigits20,
        cTrap500,
    ];

    let fixture: ComponentFixture<GiftCardListComponent>;
    let component: GiftCardListComponent;
    let lookupByCode: jasmine.Spy;

    beforeEach(async () => {
        lookupByCode = jasmine.createSpy('lookupByCode').and.callFake((code: string) =>
            of(catalog.find((c) => c.cardCode === code) ?? null),
        );
        // Página vacía a propósito — ver el comentario del describe.
        const emptyPager = {
            first: () => Promise.resolve({ rows: [], hasNext: false, hasPrev: false, total: 0 }),
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
                        createPager: () => emptyPager,
                        listAllForSummary: () => of(catalog),
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
    });

    const codesOf = (cards: readonly GiftCard[]) => cards.map((c) => c.cardCode).sort();

    it('A) TODAS + monto existente → tarjetas de TODOS los estados con ese amountCents', () => {
        component.denominationFilter.set(AMOUNT_20);
        expect(codesOf(component.visibleRows())).toEqual(
            codesOf([cAvailable20, cActive20, cSuspended20, cCancelled20, cManualLetters20, cManualDigits20]),
        );
    });

    it('B) DISPONIBLE + monto → solo AVAILABLE', () => {
        component.filter.set('AVAILABLE');
        component.denominationFilter.set(AMOUNT_20);
        expect(codesOf(component.visibleRows())).toEqual(
            codesOf([cAvailable20, cManualLetters20, cManualDigits20]),
        );
    });

    it('C) ACTIVA + monto → solo ACTIVE', () => {
        component.filter.set('ACTIVE');
        component.denominationFilter.set(AMOUNT_20);
        expect(component.visibleRows()).toEqual([cActive20]);
    });

    it('D) SUSPENDIDA + monto → solo SUSPENDED', () => {
        component.filter.set('SUSPENDED');
        component.denominationFilter.set(AMOUNT_20);
        expect(component.visibleRows()).toEqual([cSuspended20]);
    });

    it('E) CANCELADA + monto → solo CANCELLED', () => {
        component.filter.set('CANCELLED');
        component.denominationFilter.set(AMOUNT_20);
        expect(component.visibleRows()).toEqual([cCancelled20]);
    });

    it('F) monto inexistente → cero resultados (TODAS o cualquier estado)', () => {
        component.denominationFilter.set(AMOUNT_NONEXISTENT);
        expect(component.visibleRows()).toEqual([]);

        component.filter.set('AVAILABLE');
        expect(component.visibleRows()).toEqual([]);
    });

    it('G) el filtro de monto no depende del cursor/página del paginador', () => {
        // El pager de este describe SIEMPRE devuelve una página vacía — si
        // `visibleRows` todavía dependiera de `rows()`, este test (y todos
        // los de arriba) fallaría. Confirma además que no hace falta ningún
        // reinicio manual de cursor: la vista filtrada por monto nunca se
        // "queda pegada" a una página vieja porque no pasa por el paginador.
        expect(component.rows()).toEqual([]);
        component.denominationFilter.set(AMOUNT_20);
        expect(component.visibleRows().length).toBe(6);
    });

    it('H) GC20-001 (código "20", monto real Bs 500): aparece con 500, NO con 20', () => {
        component.denominationFilter.set(AMOUNT_20);
        expect(component.visibleRows()).not.toContain(cTrap500);

        component.denominationFilter.set(AMOUNT_500);
        expect(component.visibleRows()).toEqual([cTrap500]);
    });

    it('I) código nuevo (GC-000001) se filtra igual que cualquier otro', () => {
        component.denominationFilter.set(AMOUNT_20);
        expect(component.visibleRows()).toContain(cAvailable20);
    });

    it('J) código manual (ABCD1234XYZ, 000012345) se filtra igual que cualquier otro', () => {
        component.denominationFilter.set(AMOUNT_20);
        const rows = component.visibleRows();
        expect(rows).toContain(cManualLetters20);
        expect(rows).toContain(cManualDigits20);
    });

    it('K) los chips "Disponibles" agrupan por amountCents, solo AVAILABLE', () => {
        const chips = component.availableByDenomination();
        expect(chips).toEqual([
            { amountCents: AMOUNT_20, count: 3 }, // cAvailable20, cManualLetters20, cManualDigits20
            { amountCents: AMOUNT_50, count: 1 }, // cHistorical50
            { amountCents: AMOUNT_500, count: 1 }, // cTrap500
        ]);
    });

    it('L) búsqueda por código + monto combina correctamente', () => {
        component.onSearch('GC20-001'); // singleResultMode con cTrap500 (amountCents = 500 Bs)

        component.denominationFilter.set(AMOUNT_20);
        expect(component.visibleRows()).toEqual([]); // 500 Bs no es 20 Bs

        component.denominationFilter.set(AMOUNT_500);
        expect(component.visibleRows()).toEqual([cTrap500]);
    });
});
