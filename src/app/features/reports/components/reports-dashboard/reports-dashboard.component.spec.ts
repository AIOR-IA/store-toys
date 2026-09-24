import { CurrencyPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ImageCompressorService, SettingsService, ToastService } from '@core/services';
import { GiftCardsService } from '../../../gift-cards/gift-cards.service';
import { SaleReceiptService } from '../../../sales/sale-receipt.service';
import { PaymentMethod, Sale } from '../../../sales/sale.model';
import { SalesHistoryFilter, SalesService } from '../../../sales/sales.service';
import { ReportsPdfService } from '../../reports-pdf.service';
import { ReportsService } from '../../reports.service';
import { ReportsDashboardComponent } from './reports-dashboard.component';

/**
 * «Detalle de ventas del día»: el filtro por método de pago viaja a la
 * CONSULTA (no se filtra la página descargada). Aquí se prueba el cableado del
 * componente contra un paginador falso que imita la semántica de Firestore
 * (filtrar → contar → paginar por cursor); la forma real de la consulta la
 * prueba `sales.service.spec.ts`, y los índices requeridos se verifican contra
 * Firestore aparte.
 */
describe('ReportsDashboardComponent — filtro por método en la consulta', () => {
    // 24 ventas del día, de la más nueva a la más antigua: 10 efectivo, 10 QR,
    // 1 MIXTA (efectivo + QR) y 3 gift card.
    const methodsAt = (i: number): PaymentMethod[] =>
        i < 10 ? ['cash'] : i < 20 ? ['qr'] : i === 20 ? ['cash', 'qr'] : ['giftcard'];
    const DATA = Array.from({ length: 24 }, (_, i) => ({ id: `s${i}`, paymentMethods: methodsAt(i), totalCents: 1000 + i }) as unknown as Sale);
    const ids = (rows: Sale[]) => rows.map((r) => r.id);
    const idsWith = (m: PaymentMethod) => ids(DATA.filter((s) => s.paymentMethods.includes(m)));

    interface FakePager {
        filter: SalesHistoryFilter;
        size: number;
        first: jasmine.Spy;
        next: jasmine.Spy;
        prev: jasmine.Spy;
    }

    let created: FakePager[];
    let data: Sale[];
    let component: ReportsDashboardComponent;
    let reports: Record<string, jasmine.Spy>;
    let toastError: jasmine.Spy;
    /** Para simular respuestas lentas: por método, una promesa que se resuelve a mano. */
    let gate: Map<string | undefined, Promise<void>>;

    const matching = (filter: SalesHistoryFilter) =>
        data.filter((s) => !filter.paymentMethod || s.paymentMethods.includes(filter.paymentMethod));

    beforeEach(async () => {
        created = [];
        data = DATA;
        gate = new Map();
        toastError = jasmine.createSpy('error');
        reports = {
            getSummariesInRange: jasmine.createSpy('getSummariesInRange').and.returnValue(of([])),
            getSalesIntegrity: jasmine
                .createSpy('getSalesIntegrity')
                .and.returnValue(of({ salesCount: 0, totalCents: 0, cashCents: 0, qrCents: 0, giftCardCents: 0 })),
            getSellerTotals: jasmine.createSpy('getSellerTotals').and.returnValue(of(null)),
            getIssuesCountInRange: jasmine.createSpy('getIssuesCountInRange').and.returnValue(of(0)),
            getRedemptionsCountInRange: jasmine.createSpy('getRedemptionsCountInRange').and.returnValue(of(0)),
            createIssuesPager: jasmine.createSpy('createIssuesPager').and.callFake(() => ({
                first: async () => ({ rows: [], hasNext: false, hasPrev: false, total: 0 }),
            })),
        };

        const salesServiceMock = {
            listSellers: () => of([{ uid: 'u1', name: 'Vendedor Uno' }]),
            createPager: (filter: SalesHistoryFilter, size: number): FakePager => {
                let page = 0;
                const slice = () => {
                    const rows = matching(filter);
                    return {
                        rows: rows.slice(page * size, page * size + size),
                        hasNext: rows.length > (page + 1) * size,
                        hasPrev: page > 0,
                        total: rows.length,
                    };
                };
                const pager: FakePager = {
                    filter: { ...filter },
                    size,
                    first: jasmine.createSpy('first').and.callFake(async () => {
                        page = 0;
                        await gate.get(filter.paymentMethod);
                        return slice();
                    }),
                    next: jasmine.createSpy('next').and.callFake(async () => {
                        page += 1;
                        return slice();
                    }),
                    prev: jasmine.createSpy('prev').and.callFake(async () => {
                        page = Math.max(0, page - 1);
                        return slice();
                    }),
                };
                created.push(pager);
                return pager;
            },
        };

        await TestBed.configureTestingModule({
            imports: [ReportsDashboardComponent, TranslateModule.forRoot()],
            providers: [
                provideNoopAnimations(),
                CurrencyPipe,
                { provide: ReportsService, useValue: reports },
                { provide: ReportsPdfService, useValue: {} },
                { provide: SalesService, useValue: salesServiceMock },
                { provide: GiftCardsService, useValue: { listAllForSummary: () => of([]) } },
                { provide: SaleReceiptService, useValue: {} },
                { provide: ImageCompressorService, useValue: {} },
                { provide: SettingsService, useValue: { getSettings: () => of({}) } },
                { provide: ToastService, useValue: { error: toastError, info: () => undefined, success: () => undefined, errorMessage: () => undefined } },
            ],
        }).compileComponents();

        const fixture = TestBed.createComponent(ReportsDashboardComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        await fixture.whenStable();
    });

    const settle = () => new Promise<void>((r) => setTimeout(r));
    const choose = async (filter: 'all' | PaymentMethod) => {
        component.onDailyPaymentFilterChange(filter);
        await settle();
    };
    const latest = () => created[created.length - 1];
    const firstCalls = () => created.reduce((n, p) => n + p.first.calls.count(), 0);
    const walk = async () => {
        // recorre todas las páginas de la consulta actual, como el usuario con «Siguiente»
        const all = [...ids(component.dailyRows())];
        while (component.dailyHasNext()) {
            component.onDailyNextPage();
            await settle();
            all.push(...ids(component.dailyRows()));
        }
        return all;
    };

    it('«Todos» conserva la consulta y el comportamiento actuales', () => {
        expect(latest().filter).toEqual({ dateKey: latest().filter.dateKey, sellerId: undefined, paymentMethod: undefined });
        expect(component.dailyTotal()).toBe(24);
        expect(ids(component.dailyRows())).toEqual(ids(DATA.slice(0, 10)));
        expect(component.dailyHasNext()).toBeTrue();
        expect(component.dailyHasPrev()).toBeFalse();
    });

    it('QR: consulta con paymentMethod=qr; conteo y páginas salen de esa consulta (incluye la mixta)', async () => {
        await choose('qr');
        expect(latest().filter.paymentMethod).toBe('qr');
        expect(component.dailyTotal()).toBe(11); // 10 QR + 1 mixta, no 24
        expect(component.dailyRows().length).toBe(10);
        expect(component.dailyHasNext()).toBeTrue();
        expect(await walk()).toEqual(idsWith('qr'));
    });

    it('Efectivo y Gift Card devuelven exactamente sus ventas', async () => {
        await choose('cash');
        expect(component.dailyTotal()).toBe(11);
        expect(await walk()).toEqual(idsWith('cash'));

        await choose('giftcard');
        expect(component.dailyTotal()).toBe(3);
        expect(await walk()).toEqual(idsWith('giftcard'));
    });

    it('la venta mixta aparece UNA sola vez en Efectivo y UNA sola vez en QR', async () => {
        for (const m of ['cash', 'qr'] as const) {
            await choose(m);
            expect((await walk()).filter((id) => id === 's20').length).withContext(m).toBe(1);
        }
    });

    for (const size of [5, 10, 15] as const) {
        it(`tamaño ${size}: cada filtro recorre todas sus ventas sin repetir ni omitir, y hasNext/total son coherentes`, async () => {
            component.onDailyPageSizeChange(size);
            await settle();
            for (const filter of ['all', 'cash', 'qr', 'giftcard'] as const) {
                await choose(filter);
                expect(latest().size).toBe(size); // el filtro respeta el tamaño elegido
                const expected = filter === 'all' ? ids(DATA) : idsWith(filter);
                expect(component.dailyTotal()).withContext(`${filter}/${size} total`).toBe(expected.length);
                expect(component.dailyRows().length).toBeLessThanOrEqual(size);
                const walked = await walk();
                expect(walked).withContext(`${filter}/${size}`).toEqual(expected);
                expect(new Set(walked).size).toBe(walked.length);
                expect(component.dailyHasNext()).toBeFalse(); // última página
            }
        });
    }

    it('cambiar de filtro reinicia el paginador (cursores y conteo nuevos) y vuelve a la primera página', async () => {
        await choose('qr');
        component.onDailyNextPage();
        await settle();
        expect(component.dailyHasPrev()).toBeTrue();
        const beforeChange = created.length;

        await choose('cash');
        expect(created.length).toBe(beforeChange + 1); // un paginador NUEVO, no el anterior
        expect(latest().first).toHaveBeenCalledTimes(1);
        expect(component.dailyHasPrev()).toBeFalse();
        expect(ids(component.dailyRows())).toEqual(idsWith('cash').slice(0, 10));
    });

    it('«Siguiente» y «Anterior» usan el MISMO paginador (no pierden el filtro ni crean consultas nuevas)', async () => {
        await choose('qr');
        const pager = latest();
        const count = created.length;

        component.onDailyNextPage();
        await settle();
        expect(latest()).toBe(pager);
        expect(created.length).toBe(count);
        expect(pager.next).toHaveBeenCalledTimes(1);
        expect(ids(component.dailyRows())).toEqual(idsWith('qr').slice(10)); // solo la mixta

        component.onDailyPrevPage();
        await settle();
        expect(created.length).toBe(count);
        expect(pager.prev).toHaveBeenCalledTimes(1);
        expect(ids(component.dailyRows())).toEqual(idsWith('qr').slice(0, 10));
    });

    it('una consulta por cambio de filtro: sin duplicados ni bucles', async () => {
        const base = firstCalls();
        await choose('qr');
        await choose('cash');
        await choose('all');
        expect(firstCalls() - base).toBe(3);
        // y elegir el MISMO filtro otra vez no dispara más que una consulta
        const again = firstCalls();
        await choose('all');
        expect(firstCalls() - again).toBe(1);
    });

    it('el vendedor y el tamaño de página se conservan junto con el método', async () => {
        await choose('qr');
        component.onSellerFilterChange('u1');
        await settle();
        expect(latest().filter.sellerId).toBe('u1');
        expect(latest().filter.paymentMethod).toBe('qr');

        component.onDailyPageSizeChange(5);
        await settle();
        expect(latest().size).toBe(5);
        expect(latest().filter).toEqual(jasmine.objectContaining({ sellerId: 'u1', paymentMethod: 'qr' }));

        component.onSellerFilterChange(null);
        await settle();
        expect(latest().filter.sellerId).toBeUndefined();
        expect(latest().filter.paymentMethod).toBe('qr');
    });

    it('estado vacío: solo cuando NINGUNA venta de toda la consulta coincide (y nunca por tener la página vacía)', async () => {
        data = DATA.filter((s) => !s.paymentMethods.includes('giftcard')); // sin gift card en el día
        await choose('giftcard');
        expect(component.dailyRows().length).toBe(0);
        expect(component.dailyTotal()).toBe(0);
        expect(component.dailyHasNext()).toBeFalse();

        // con datos que sí coinciden, aunque estén al final del día, la PRIMERA página los trae
        data = [...DATA.slice(0, 20).map((s) => ({ ...s, paymentMethods: ['cash'] as PaymentMethod[] })), { ...DATA[21] }];
        await choose('giftcard');
        expect(component.dailyRows().length).toBe(1); // antes: página vacía aunque hubiera coincidencia
        expect(component.dailyTotal()).toBe(1);
    });

    it('los KPIs y la integridad NO se recargan ni cambian al cambiar el filtro', async () => {
        const kpiCalls = () =>
            ['getSummariesInRange', 'getSalesIntegrity', 'getSellerTotals', 'getIssuesCountInRange', 'getRedemptionsCountInRange'].map(
                (k) => reports[k].calls.count(),
            );
        const totalsBefore = JSON.stringify(component.rangeTotals());
        const integrityBefore = JSON.stringify(component.integrity());
        const before = kpiCalls();

        for (const f of ['qr', 'cash', 'giftcard', 'all'] as const) await choose(f);

        expect(kpiCalls()).toEqual(before);
        expect(JSON.stringify(component.rangeTotals())).toBe(totalsBefore);
        expect(JSON.stringify(component.integrity())).toBe(integrityBefore);
        expect(component.cashReceivedCents()).toBe(0);
    });

    it('una respuesta lenta de un filtro anterior no pisa la del filtro actual', async () => {
        let release!: () => void;
        gate.set('qr', new Promise<void>((r) => (release = r)));

        component.onDailyPaymentFilterChange('qr'); // se queda esperando
        component.onDailyPaymentFilterChange('cash'); // responde de inmediato
        await settle();
        expect(component.dailyTotal()).toBe(11);
        expect(ids(component.dailyRows())).toEqual(idsWith('cash').slice(0, 10));

        release(); // llega tarde la respuesta de «qr»
        await settle();
        expect(ids(component.dailyRows())).toEqual(idsWith('cash').slice(0, 10)); // sigue mostrando «cash»
        expect(component.loadingDaily()).toBeFalse();
    });

    it('si la consulta filtrada falla, no deja a la vista filas de otra consulta bajo el filtro elegido', async () => {
        const original = created[0];
        expect(original).toBeDefined();
        // el siguiente paginador que se cree para «qr» falla (p. ej. índice sin desplegar)
        (TestBed.inject(SalesService) as unknown as { createPager: (f: SalesHistoryFilter, s: number) => FakePager }).createPager = (
            filter,
            size,
        ) => {
            const p = { filter, size, first: jasmine.createSpy().and.callFake(async () => { throw new Error('failed-precondition'); }), next: jasmine.createSpy(), prev: jasmine.createSpy() };
            created.push(p);
            return p;
        };
        await choose('qr');
        expect(component.dailyRows()).toEqual([]);
        expect(component.dailyTotal()).toBe(0);
        expect(component.dailyHasNext()).toBeFalse();
        expect(toastError).toHaveBeenCalledWith('app.common.errors.general');
    });
});
