import { TestBed } from '@angular/core/testing';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
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
import { DailySummary } from './daily-summary.model';
import { giftCardIssueConverter } from '../gift-cards/gift-card.converter';
import {
    IssueForTotals,
    IssuesPage,
    SELLER_ISSUES_PAGE_SIZE,
    SalesAggregateTotals,
    SellerIssuesTotals,
    ReportsService,
    buildSellerBreakdown,
    mergeDailySummaries,
    receivedTotals,
    sumAllIssuePages,
    sumIssues,
} from './reports.service';

const bs = (n: number) => n * 100;

describe('Reportes por vendedor — consulta de Gift Cards vendidas', () => {
    it('server-side: activatedBy (igualdad) + dateKey (rango) + orderBy(dateKey) + página interna — índice (activatedBy, dateKey)', () => {
        TestBed.configureTestingModule({
            providers: [
                provideFirebaseApp(() => initializeApp({ projectId: 'demo-spec' })),
                provideFirestore(() => getFirestore()),
            ],
        });
        const service = TestBed.inject(ReportsService);
        TestBed.runInInjectionContext(() => {
            const fs = TestBed.inject(Firestore);
            const issues = collection(fs, 'giftCardIssues').withConverter(giftCardIssueConverter);
            const expected = query(
                issues,
                where('activatedBy', '==', 'u1'),
                where('dateKey', '>=', '2026-09-01'),
                where('dateKey', '<=', '2026-09-30'),
                orderBy('dateKey'),
                limit(SELLER_ISSUES_PAGE_SIZE),
            );
            expect(queryEqual(service.sellerIssuesQuery('u1', '2026-09-01', '2026-09-30'), expected)).toBeTrue();
        });
    });
});

describe('Reportes por vendedor — fórmulas', () => {
    const issue = (amount: number, ...payments: ['cash' | 'qr', number][]) => ({
        amountCents: amount,
        payments: payments.map(([method, amountCents]) => ({ method, amountCents })),
    });
    const sales = (o: Partial<SalesAggregateTotals>): SalesAggregateTotals => ({
        salesCount: 0,
        totalCents: 0,
        cashCents: 0,
        qrCents: 0,
        giftCardCents: 0,
        ...o,
    });
    const noIssues: SellerIssuesTotals = { issuesCount: 0, nominalCents: 0, cashCents: 0, qrCents: 0 };

    it('sumIssues suma nominal y cobro por efectivo/QR (incluye pagos mixtos)', () => {
        expect(sumIssues([issue(bs(1000), ['cash', bs(1000)]), issue(bs(500), ['cash', bs(100)], ['qr', bs(400)])])).toEqual({
            issuesCount: 2,
            nominalCents: bs(1500),
            cashCents: bs(1100),
            qrCents: bs(400),
        });
        expect(sumIssues([])).toEqual(noIssues);
    });

    it('mercadería 500 efectivo + Gift Card 1.000 efectivo + diferencia de canje 80 → efectivo recibido 1.580', () => {
        // Sus ventas: 500 en efectivo y un canje de 1.080 = GC 1.000 aplicada + 80 en efectivo
        // (la diferencia ya viene dentro de cashCents de la venta).
        const b = buildSellerBreakdown(
            sales({ salesCount: 2, totalCents: bs(500 + 1080), cashCents: bs(500 + 80), giftCardCents: bs(1000) }),
            sumIssues([issue(bs(1000), ['cash', bs(1000)])]),
        );
        expect(b.cashReceivedCents).toBe(bs(1580));
        expect(b.qrReceivedCents).toBe(0);
        expect(b.moneyReceivedCents).toBe(bs(1580));
        expect(b.giftCardAppliedCents).toBe(bs(1000)); // aplicada: se muestra, pero NO suma
        expect(b.giftCardsSoldCents).toBe(bs(1000));
        expect(b.giftCardsSoldCount).toBe(1);
        expect(b.salesCashCents).toBe(bs(580)); // la diferencia (80) está UNA sola vez
    });

    describe('vendedores A y B y el reporte general', () => {
        // A: vende GC 1.000 en efectivo, una venta de 200 en efectivo y un canje (GC 1.000 + 80 en QR).
        // B: vende GC 500 por QR.
        const issuesA = [issue(bs(1000), ['cash', bs(1000)])];
        const issuesB = [issue(bs(500), ['qr', bs(500)])];
        const salesA = sales({ salesCount: 2, totalCents: bs(200 + 1080), cashCents: bs(200), qrCents: bs(80), giftCardCents: bs(1000) });
        const salesB = sales({});
        const general = {
            dateKey: '2026-09-01',
            monthKey: '2026-09',
            year: 2026,
            salesCount: 2,
            itemsCount: 2,
            totalCents: bs(1280),
            discountCents: 0,
            cashCents: bs(200),
            qrCents: bs(80),
            giftCardCents: bs(1000),
            giftCardsIssuedCents: bs(1500),
            giftCardForfeitedCents: 0,
            giftCardIssuesCashCents: bs(1000),
            giftCardIssuesQrCents: bs(500),
            products: {},
        } as DailySummary;

        it('1–5. filtro A = solo sus 1.000; filtro B = solo sus 500; general = 1.500', () => {
            const a = buildSellerBreakdown(sales({}), sumIssues(issuesA));
            const b = buildSellerBreakdown(sales({}), sumIssues(issuesB));
            expect(a.giftCardsSoldCents).toBe(bs(1000));
            expect(a.issuesCashCents).toBe(bs(1000));
            expect(a.issuesQrCents).toBe(0);
            expect(b.giftCardsSoldCents).toBe(bs(500));
            expect(b.issuesQrCents).toBe(bs(500));
            expect(b.issuesCashCents).toBe(0);
            expect(mergeDailySummaries([general]).giftCardsIssuedCents).toBe(bs(1500));
        });

        it('6–7. A: venta de 200 en efectivo + canje con diferencia de 80 en QR → solo 80 es nueva entrada QR', () => {
            const a = buildSellerBreakdown(salesA, sumIssues(issuesA));
            expect(a.cashReceivedCents).toBe(bs(1200)); // 200 de mercadería + 1.000 de su Gift Card
            expect(a.qrReceivedCents).toBe(bs(80)); // la diferencia; la GC aplicada (1.000) no entra
            expect(a.moneyReceivedCents).toBe(bs(1280));
            expect(a.giftCardAppliedCents).toBe(bs(1000));
        });

        it('8. cancelar el canje revierte la venta y su diferencia, pero NO la emisión', () => {
            // Tras cancelSale el agregado de sus ventas `completed` ya no incluye el canje.
            const afterCancel = sales({ salesCount: 1, totalCents: bs(200), cashCents: bs(200) });
            const a = buildSellerBreakdown(afterCancel, sumIssues(issuesA));
            expect(a.qrReceivedCents).toBe(0);
            expect(a.giftCardAppliedCents).toBe(0);
            expect(a.issuesCashCents).toBe(bs(1000)); // la emisión sigue
            expect(a.moneyReceivedCents).toBe(bs(1200));
        });

        it('9. una Gift Card CANCELADA administrativamente sigue contando para su vendedor (no hay devolución)', () => {
            // La consulta por vendedor no filtra por estado: el ciclo `cancelled` conserva su `payments`.
            const cancelledIssue = { ...issue(bs(1000), ['cash', bs(1000)]), status: 'cancelled' };
            expect(sumIssues([cancelledIssue]).cashCents).toBe(bs(1000));
        });

        it('12. conciliación: Σ cobros de los vendedores == cobros del reporte general', () => {
            const a = buildSellerBreakdown(salesA, sumIssues(issuesA));
            const b = buildSellerBreakdown(salesB, sumIssues(issuesB));
            const g = receivedTotals(mergeDailySummaries([general]));
            expect(a.cashReceivedCents + b.cashReceivedCents).toBe(g.cashCents);
            expect(a.qrReceivedCents + b.qrReceivedCents).toBe(g.qrCents);
            expect(a.moneyReceivedCents + b.moneyReceivedCents).toBe(g.totalCents);
            expect(g.totalCents).toBe(bs(1780));
        });
    });
});

/**
 * Recorrido por páginas internas: sin tope oculto, sin duplicados, ciclos de
 * cualquier estado. `fakeFirestore` imita la semántica real: resultados
 * ordenados por (dateKey, id), `startAfter(cursor)` y `limit(pageSize)`.
 */
describe('sumAllIssuePages — recorrido por páginas sin tope oculto', () => {
    const PAGE = 500;
    const make = (n: number, o: { cancelledEvery?: number } = {}): (IssueForTotals & { status: string })[] =>
        Array.from({ length: n }, (_, i) => ({
            id: `i${String(i).padStart(6, '0')}`,
            amountCents: bs(100),
            // par: efectivo 60 + QR 40; impar: solo QR 100 — así hay efectivo Y QR en el total
            payments:
                i % 2 === 0
                    ? [
                          { method: 'cash' as const, amountCents: bs(60) },
                          { method: 'qr' as const, amountCents: bs(40) },
                      ]
                    : [{ method: 'qr' as const, amountCents: bs(100) }],
            status: o.cancelledEvery && i % o.cancelledEvery === 0 ? 'cancelled' : 'active',
        }));

    /** Firestore falso: devuelve la página que sigue al cursor (índice del último devuelto). */
    const fakeFirestore = (docs: IssueForTotals[], pageSize = PAGE) => {
        const calls: (number | null)[] = [];
        const fetchPage = async (after: number | null): Promise<IssuesPage<number>> => {
            calls.push(after);
            const start = after === null ? 0 : after + 1;
            const items = docs.slice(start, start + pageSize);
            return { items, last: items.length ? start + items.length - 1 : null };
        };
        return { fetchPage, calls };
    };
    const expected = (docs: (IssueForTotals & { status?: string })[]) => ({
        issuesCount: docs.length,
        nominalCents: docs.length * bs(100),
        cashCents: Math.ceil(docs.length / 2) * bs(60),
        qrCents: Math.ceil(docs.length / 2) * bs(40) + Math.floor(docs.length / 2) * bs(100),
    });

    it('0 emisiones → ceros, una sola consulta', async () => {
        const { fetchPage, calls } = fakeFirestore([]);
        expect(await sumAllIssuePages(fetchPage, PAGE)).toEqual({ issuesCount: 0, nominalCents: 0, cashCents: 0, qrCents: 0 });
        expect(calls.length).toBe(1);
    });

    it('1 emisión', async () => {
        const docs = make(1);
        const { fetchPage, calls } = fakeFirestore(docs);
        expect(await sumAllIssuePages(fetchPage, PAGE)).toEqual(expected(docs));
        expect(calls.length).toBe(1);
    });

    it('varias emisiones dentro de una página', async () => {
        const docs = make(37);
        const { fetchPage, calls } = fakeFirestore(docs);
        expect(await sumAllIssuePages(fetchPage, PAGE)).toEqual(expected(docs));
        expect(calls.length).toBe(1);
    });

    it('EXACTAMENTE el tamaño de una página: pide una segunda (vacía) y no pierde ni repite nada', async () => {
        const docs = make(PAGE);
        const { fetchPage, calls } = fakeFirestore(docs);
        expect(await sumAllIssuePages(fetchPage, PAGE)).toEqual(expected(docs));
        expect(calls).toEqual([null, PAGE - 1]);
    });

    it('más de una página (PAGE + 1)', async () => {
        const docs = make(PAGE + 1);
        const { fetchPage, calls } = fakeFirestore(docs);
        expect(await sumAllIssuePages(fetchPage, PAGE)).toEqual(expected(docs));
        expect(calls).toEqual([null, PAGE - 1]);
    });

    it('más de 1.000 emisiones (2.345): las suma TODAS, sin tope silencioso', async () => {
        const docs = make(2345);
        const { fetchPage, calls } = fakeFirestore(docs);
        const total = await sumAllIssuePages(fetchPage, PAGE);
        expect(total).toEqual(expected(docs));
        expect(total.issuesCount).toBe(2345);
        expect(calls.length).toBe(5); // 4 páginas completas + la última de 345
    });

    it('efectivo + QR: cada método se acumula por separado', async () => {
        const docs = make(1200);
        const { fetchPage } = fakeFirestore(docs);
        const total = await sumAllIssuePages(fetchPage, PAGE);
        expect(total.cashCents).toBe(600 * bs(60));
        expect(total.qrCents).toBe(600 * bs(40) + 600 * bs(100));
        expect(total.cashCents + total.qrCents).toBe(total.nominalCents); // cada ciclo se pagó completo
    });

    it('ciclos cancelados INCLUIDOS: la baja administrativa no revierte el ingreso', async () => {
        const docs = make(1100, { cancelledEvery: 3 });
        expect(docs.filter((d) => d.status === 'cancelled').length).toBeGreaterThan(300);
        const { fetchPage } = fakeFirestore(docs);
        expect(await sumAllIssuePages(fetchPage, PAGE)).toEqual(expected(docs));
    });

    it('ningún duplicado: un documento repetido entre páginas se cuenta una sola vez', async () => {
        const docs = make(PAGE + 200);
        // Firestore no lo hace, pero la defensa debe aguantar una página que solape con la anterior.
        const overlapping = async (after: number | null): Promise<IssuesPage<number>> => {
            const start = after === null ? 0 : Math.max(0, after - 49); // repite los últimos 50
            const items = docs.slice(start, start + PAGE);
            return { items, last: start + items.length - 1 };
        };
        expect(await sumAllIssuePages(overlapping, PAGE)).toEqual(expected(docs));
    });

    it('nunca entra en un bucle infinito si una página no aporta nada nuevo', async () => {
        const docs = make(PAGE);
        let calls = 0;
        const stuck = async (): Promise<IssuesPage<number>> => {
            calls += 1;
            return { items: docs, last: PAGE - 1 }; // siempre la misma página completa
        };
        expect((await sumAllIssuePages(stuck, PAGE)).issuesCount).toBe(PAGE);
        expect(calls).toBe(2);
    });

    it('suma final == total esperado independientemente del tamaño de página', async () => {
        const docs = make(1777, { cancelledEvery: 5 });
        for (const size of [1, 7, 100, 500, 1777, 5000]) {
            const { fetchPage } = fakeFirestore(docs, size);
            expect(await sumAllIssuePages(fetchPage, size)).toEqual(expected(docs));
        }
    });
});
