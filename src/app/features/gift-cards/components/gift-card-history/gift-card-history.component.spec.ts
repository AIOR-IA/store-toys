import { CurrencyPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { SessionService } from '@core/session';
import { SettingsService, ToastService } from '@core/services';
import { PageResult, PageSize } from '@core/data';
import { SalesService } from '../../../sales/sales.service';
import { GiftCardReceiptService } from '../../gift-card-receipt.service';
import { GiftCardIssuesHistoryFilter, GiftCardsService } from '../../gift-cards.service';
import { GiftCardReceipt } from '../../gift-card.model';
import { GiftCardHistoryComponent } from './gift-card-history.component';

const makeReceipt = (overrides: Partial<GiftCardReceipt> = {}): GiftCardReceipt => ({
    id: 'iss1',
    cardCode: 'GC-000010',
    cycleNumber: 1,
    amountCents: 50000,
    buyerName: 'Camila',
    activatedAt: Timestamp.now(),
    activatedByName: 'Vendedor',
    dateKey: '2026-10-24',
    payments: [{ method: 'cash', amountCents: 50000 }],
    ...overrides,
});

/**
 * Historial de Gift Cards (ajuste posterior, Recibo/Historial — prompt §22,
 * letras I, K, L, M, O, P). La paginación/filtrado por origen ya se prueba a
 * fondo en `tests/functions/giftcard-issues.harness.js` (el servidor es la
 * fuente de verdad); aquí solo se prueba que el COMPONENTE pasa los filtros
 * correctos al pager, muestra las filas tal cual se las dan, y abre el
 * detalle de la fila correcta — nunca que reconstruye lógica de servidor.
 */
describe('GiftCardHistoryComponent', () => {
    let component: GiftCardHistoryComponent;
    let fixture: ComponentFixture<GiftCardHistoryComponent>;
    let createIssuesHistoryPager: jasmine.Spy;
    let lastFilter: GiftCardIssuesHistoryFilter | undefined;
    let lastPageSize: PageSize | undefined;
    let pagerSpy: { first: jasmine.Spy; next: jasmine.Spy; prev: jasmine.Spy };

    const flush = () => new Promise((r) => setTimeout(r));

    const setup = async (opts: {
        isAdmin?: boolean;
        uid?: string;
        rows?: GiftCardReceipt[];
        hasNext?: boolean;
    } = {}) => {
        const { isAdmin = false, uid = 'seller', rows = [makeReceipt()], hasNext = false } = opts;
        const result: PageResult<GiftCardReceipt> = { rows, hasNext, hasPrev: false, total: rows.length };

        pagerSpy = {
            first: jasmine.createSpy('first').and.callFake(async () => result),
            next: jasmine.createSpy('next').and.callFake(async () => result),
            prev: jasmine.createSpy('prev').and.callFake(async () => result),
        };
        createIssuesHistoryPager = jasmine
            .createSpy('createIssuesHistoryPager')
            .and.callFake((filter: GiftCardIssuesHistoryFilter, pageSize: PageSize) => {
                lastFilter = filter;
                lastPageSize = pageSize;
                return pagerSpy;
            });

        await TestBed.configureTestingModule({
            imports: [GiftCardHistoryComponent, TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: GiftCardsService, useValue: { createIssuesHistoryPager } },
                { provide: SalesService, useValue: { listSellers: () => of([]) } },
                {
                    provide: SessionService,
                    useValue: {
                        session: () =>
                            isAdmin ? { status: 'active', role: 'admin', uid } : { status: 'active', role: 'user', uid },
                    },
                },
                { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
                {
                    provide: GiftCardReceiptService,
                    useValue: { print: jasmine.createSpy('print').and.returnValue(Promise.resolve()) },
                },
                {
                    provide: SettingsService,
                    useValue: { getSettings: () => of({ timezone: 'America/La_Paz' }) },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(GiftCardHistoryComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        await flush();
        fixture.detectChanges();
    };

    it('I) una emisión real aparece en la primera página', async () => {
        await setup({ rows: [makeReceipt()] });
        expect(component.rows().length).toBe(1);
        expect(component.rows()[0].cardCode).toBe('GC-000010');
    });

    it('K) misma tarjeta con 2 ciclos: ambas filas aparecen independientes, cada una con su propio comprador/monto', async () => {
        const cyc1 = makeReceipt({ id: 'cyc1', buyerName: 'Camila', amountCents: 10000 });
        const cyc2 = makeReceipt({ id: 'cyc2', buyerName: 'Roberto', amountCents: 50000 });
        await setup({ rows: [cyc2, cyc1] }); // más reciente primero, como ya devuelve el servidor

        expect(component.rows().length).toBe(2);
        expect(component.rows()[0].buyerName).toBe('Roberto');
        expect(component.rows()[0].amountCents).toBe(50000);
        expect(component.rows()[1].buyerName).toBe('Camila');
        expect(component.rows()[1].amountCents).toBe(10000);
    });

    it('L) reimprimir desde la fila del ciclo 1 usa exactamente el snapshot del ciclo 1', async () => {
        const cyc1 = makeReceipt({ id: 'cyc1', buyerName: 'Camila', amountCents: 10000 });
        const cyc2 = makeReceipt({ id: 'cyc2', buyerName: 'Roberto', amountCents: 50000 });
        await setup({ rows: [cyc2, cyc1] });

        component.openDetail(component.rows()[1]);
        expect(component.detailReceipt()?.id).toBe('cyc1');
        expect(component.detailReceipt()?.buyerName).toBe('Camila');
    });

    it('M) reimprimir desde la fila del ciclo 2 usa exactamente el snapshot del ciclo 2', async () => {
        const cyc1 = makeReceipt({ id: 'cyc1', buyerName: 'Camila', amountCents: 10000 });
        const cyc2 = makeReceipt({ id: 'cyc2', buyerName: 'Roberto', amountCents: 50000 });
        await setup({ rows: [cyc2, cyc1] });

        component.openDetail(component.rows()[0]);
        expect(component.detailReceipt()?.id).toBe('cyc2');
        expect(component.detailReceipt()?.buyerName).toBe('Roberto');
    });

    it('O) paginación: Siguiente/Anterior delegan en el pager y refrescan hasNext/filas', async () => {
        await setup({ rows: [makeReceipt({ id: 'p1' })], hasNext: true });
        expect(component.hasNext()).toBeTrue();

        component.onNextPage();
        await flush();
        expect(pagerSpy.next).toHaveBeenCalled();

        component.onPrevPage();
        await flush();
        expect(pagerSpy.prev).toHaveBeenCalled();
    });

    it('P) búsqueda por código: normaliza y recrea el pager con cardCode en el filtro; vacío lo limpia', async () => {
        await setup();
        createIssuesHistoryPager.calls.reset();

        component.onSearch('  gc-000010 ');
        await flush();
        expect(lastFilter?.cardCode).toBe('GC-000010');

        component.onSearch('   ');
        await flush();
        expect(lastFilter?.cardCode).toBeUndefined();
    });

    it('un vendedor (no admin) siempre consulta forzado a su propio uid, nunca ve el filtro de vendedor', async () => {
        await setup({ isAdmin: false, uid: 'seller' });
        expect(lastFilter?.sellerId).toBe('seller');
        expect(component.isAdmin()).toBeFalse();
    });

    it('el admin puede acotar por vendedor específico', async () => {
        await setup({ isAdmin: true, uid: 'admin' });
        createIssuesHistoryPager.calls.reset();

        component.onSellerChange('seller2');
        await flush();
        expect(lastFilter?.sellerId).toBe('seller2');
        expect(lastPageSize).toBeDefined();
    });
});
