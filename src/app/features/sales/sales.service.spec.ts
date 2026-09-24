import { TestBed } from '@angular/core/testing';
import {
    Firestore,
    collection,
    getFirestore,
    limit,
    orderBy,
    provideFirestore,
    query,
    queryEqual,
    where,
} from '@angular/fire/firestore';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { Functions } from '@angular/fire/functions';
import { CursorPager } from '@core/data';
import { saleConverter } from './sale.converter';
import { Sale } from './sale.model';
import { SalesService } from './sales.service';

/**
 * `createPager` — filtro por método de pago en la CONSULTA (Reportes, detalle
 * diario). Se compara la consulta construida contra la esperada con
 * `queryEqual` del SDK: no hay red ni datos, solo la forma exacta de la query.
 * `buildQuery`/`buildCountQuery` son privados del paginador; se leen con un
 * cast únicamente en la prueba.
 */
describe('SalesService.createPager — filtro por método de pago', () => {
    let service: SalesService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideFirebaseApp(() => initializeApp({ projectId: 'demo-spec' })),
                provideFirestore(() => getFirestore()),
                { provide: Functions, useValue: {} },
            ],
        });
        service = TestBed.inject(SalesService);
    });

    /** Los envoltorios de @angular/fire exigen contexto de inyección. */
    const inCtx = <T>(fn: (sales: () => ReturnType<typeof collection>) => T): T =>
        TestBed.runInInjectionContext(() => {
            const fs = TestBed.inject(Firestore);
            return fn(() => collection(fs, 'sales').withConverter(saleConverter) as unknown as ReturnType<typeof collection>);
        });
    const pageQuery = (pager: CursorPager<Sale>) =>
        (pager as unknown as { buildQuery: (c: unknown[]) => ReturnType<typeof query> }).buildQuery([limit(11)]);
    const countQuery = (pager: CursorPager<Sale>) =>
        (pager as unknown as { buildCountQuery: () => ReturnType<typeof query> }).buildCountQuery();

    it('sin método («Todos»): la MISMA consulta de siempre (dateKey + orderBy createdAt desc)', () => {
        inCtx((sales) => {
            const pager = service.createPager({ dateKey: '2026-09-14' }, 10);
            expect(
                queryEqual(pageQuery(pager), query(sales(), where('dateKey', '==', '2026-09-14'), orderBy('createdAt', 'desc'), limit(11))),
            ).toBeTrue();
        });
    });

    it('sin método y con vendedor: la misma consulta de siempre (dateKey + sellerId + orderBy)', () => {
        inCtx((sales) => {
            const pager = service.createPager({ dateKey: '2026-09-14', sellerId: 'u1' }, 10);
            expect(
                queryEqual(
                    pageQuery(pager),
                    query(sales(), where('dateKey', '==', '2026-09-14'), where('sellerId', '==', 'u1'), orderBy('createdAt', 'desc'), limit(11)),
                ),
            ).toBeTrue();
        });
    });

    for (const method of ['cash', 'qr', 'giftcard'] as const) {
        it(`método «${method}»: array-contains sobre paymentMethods, antes de paginar`, () => {
            inCtx((sales) => {
                const pager = service.createPager({ dateKey: '2026-09-14', paymentMethod: method }, 5);
                expect(
                    queryEqual(
                        pageQuery(pager),
                        query(
                            sales(),
                            where('dateKey', '==', '2026-09-14'),
                            where('paymentMethods', 'array-contains', method),
                            orderBy('createdAt', 'desc'),
                            limit(11),
                        ),
                    ),
                ).toBeTrue();
            });
        });
    }

    it('método + vendedor: fecha, vendedor y método en la misma consulta', () => {
        inCtx((sales) => {
            const pager = service.createPager({ dateKey: '2026-09-14', sellerId: 'u1', paymentMethod: 'qr' }, 15);
            expect(
                queryEqual(
                    pageQuery(pager),
                    query(
                        sales(),
                        where('dateKey', '==', '2026-09-14'),
                        where('sellerId', '==', 'u1'),
                        where('paymentMethods', 'array-contains', 'qr'),
                        orderBy('createdAt', 'desc'),
                        limit(11),
                    ),
                ),
            ).toBeTrue();
        });
    });

    it('el CONTEO usa exactamente los mismos filtros y orden que la página (sin limit)', () => {
        inCtx((sales) => {
            const pager = service.createPager({ dateKey: '2026-09-14', paymentMethod: 'cash' }, 10);
            expect(
                queryEqual(
                    countQuery(pager),
                    query(sales(), where('dateKey', '==', '2026-09-14'), where('paymentMethods', 'array-contains', 'cash'), orderBy('createdAt', 'desc')),
                ),
            ).toBeTrue();
            // y NO coincide con el conteo sin método → el filtro sí forma parte del conteo
            expect(
                queryEqual(countQuery(pager), query(sales(), where('dateKey', '==', '2026-09-14'), orderBy('createdAt', 'desc'))),
            ).toBeFalse();
        });
    });

    it('métodos distintos producen consultas distintas', () => {
        inCtx(() => {
            const q = (m: 'cash' | 'qr') => pageQuery(service.createPager({ dateKey: '2026-09-14', paymentMethod: m }, 10));
            expect(queryEqual(q('cash'), q('qr'))).toBeFalse();
        });
    });
});
