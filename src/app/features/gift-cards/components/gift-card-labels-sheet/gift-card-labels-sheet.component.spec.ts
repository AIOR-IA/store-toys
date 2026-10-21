import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurrencyPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ToastService } from '@core/services';
import { PageResult, PageSize } from '@core/data';
import { LABEL_SIZE_MM } from '@shared/constants';
import { GiftCardsFilter, GiftCardsService } from '../../gift-cards.service';
import { GiftCard, GiftCardStatus } from '../../gift-card.model';
import { GiftCardLabelsSheetComponent } from './gift-card-labels-sheet.component';

/** mismo factor que usa el componente para convertir mm → pt (pdfmake mide en pt). */
const MM_TO_PT = 2.834645669;
const LETTER_WIDTH_PT = 8.5 * 72;

const makeCard = (code: string, status: GiftCardStatus = 'AVAILABLE'): GiftCard =>
    ({
        cardCode: code,
        amountCents: 25000,
        status,
        cycleNumber: status === 'AVAILABLE' ? 0 : 1,
        activeCycleId: null,
        lastCycleId: null,
        replacedByCode: null,
        replacesCode: null,
        pendingReplacement: false,
        currentBuyerName: null,
    }) as unknown as GiftCard;

/** Paginador en memoria con el mismo contrato que `CursorPager` (sin Firestore). */
class FakePager {
    private index = 0;
    constructor(
        private readonly catalog: GiftCard[],
        public pageSize: PageSize,
    ) {}
    first = jasmine.createSpy('first').and.callFake(async () => {
        this.index = 0;
        return this.page();
    });
    next = jasmine.createSpy('next').and.callFake(async () => {
        this.index += 1;
        return this.page();
    });
    prev = jasmine.createSpy('prev').and.callFake(async () => {
        this.index = Math.max(0, this.index - 1);
        return this.page();
    });
    private page(): PageResult<GiftCard> {
        const from = this.index * this.pageSize;
        return {
            rows: this.catalog.slice(from, from + this.pageSize),
            hasNext: from + this.pageSize < this.catalog.length,
            hasPrev: this.index > 0,
            total: this.catalog.length,
        };
    }
}

describe('GiftCardLabelsSheetComponent', () => {
    let component: GiftCardLabelsSheetComponent;
    let fixture: ComponentFixture<GiftCardLabelsSheetComponent>;
    let createPager: jasmine.Spy;
    let lookupByCode: jasmine.Spy;
    let catalog: GiftCard[];

    const flush = () => new Promise((r) => setTimeout(r));

    const setup = async (initialCatalog: GiftCard[]) => {
        catalog = initialCatalog;
        createPager = jasmine
            .createSpy('createPager')
            .and.callFake((_f: GiftCardsFilter, size: PageSize) => new FakePager(catalog, size));
        lookupByCode = jasmine
            .createSpy('lookupByCode')
            .and.callFake((code: string) => of(catalog.find((c) => c.cardCode === code) ?? null));

        await TestBed.configureTestingModule({
            imports: [GiftCardLabelsSheetComponent, TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                { provide: GiftCardsService, useValue: { createPager, lookupByCode } },
                { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(GiftCardLabelsSheetComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        await flush();
        fixture.detectChanges();
    };

    describe('selección — reglas de estado (K, L)', () => {
        beforeEach(async () => {
            await setup([
                makeCard('GC-000001', 'AVAILABLE'),
                makeCard('GC-000002', 'CANCELLED'),
                makeCard('GC-000006', 'ACTIVE'), // L: nacida de un reemplazo, sigue siendo ACTIVE normal
            ]);
        });

        it('K) una tarjeta CANCELLED no puede seleccionarse', () => {
            const cancelled = component.rows().find((c) => c.cardCode === 'GC-000002')!;
            expect(component.isSelectable(cancelled)).toBeFalse();
            component.toggleSelected(cancelled, true);
            expect(component.isSelected(cancelled)).toBeFalse();
            expect(component.selectedCount()).toBe(0);
        });

        it('L) una tarjeta ACTIVE nacida de un reemplazo SÍ puede seleccionarse', () => {
            const replacement = component.rows().find((c) => c.cardCode === 'GC-000006')!;
            expect(component.isSelectable(replacement)).toBeTrue();
            component.toggleSelected(replacement, true);
            expect(component.isSelected(replacement)).toBeTrue();
            expect(component.selectedCount()).toBe(1);
        });

        it('una AVAILABLE normal también puede seleccionarse', () => {
            const available = component.rows().find((c) => c.cardCode === 'GC-000001')!;
            component.toggleSelected(available, true);
            expect(component.isSelected(available)).toBeTrue();
        });
    });

    describe('selección entre páginas (G)', () => {
        beforeEach(async () => {
            const many = Array.from({ length: 25 }, (_, i) =>
                makeCard(`GC-${String(i + 1).padStart(6, '0')}`),
            );
            await setup(many);
        });

        it('G) selección persiste al cambiar de página', async () => {
            component.toggleSelected(component.rows()[0], true); // GC-000001, página 1
            component.onNextPage();
            await flush();
            component.toggleSelected(component.rows()[4], true); // GC-000015, página 2

            expect(component.selectedCount()).toBe(2);

            component.onPrevPage();
            await flush();
            expect(component.isSelected(component.rows()[0])).toBeTrue();
            expect(component.selectedCount()).toBe(2);
        });
    });

    describe('generatePdf — geometría, orden y contenido (A-F, H, I, J)', () => {
        const run = async (cards: GiftCard[]) => {
            const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
                default: { createPdf: (doc: unknown) => unknown };
            };
            let doc:
                | {
                      pageSize: string;
                      pageMargins: [number, number, number, number];
                      content: {
                          table: { widths: number[]; body: unknown[][] };
                          layout: {
                              paddingLeft: (i: number) => number;
                              paddingRight: (i: number) => number;
                          };
                      }[];
                  }
                | undefined; // `layout` vive junto a `table`, mismo nivel (ver generatePdf)
            const spy = spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((
                d: typeof doc,
            ) => {
                doc = d;
                return { download: () => undefined };
            }) as never);

            for (const card of cards) component.toggleSelected(card, true);
            await component.generatePdf();
            spy.calls.reset();

            return doc!;
        };

        it('A) 1 Gift Card → 1 etiqueta, 1 fila', async () => {
            await setup([makeCard('GC-000001')]);
            const doc = await run(catalog);
            expect(doc.content[0].table.widths.length).toBe(4);
            expect(doc.content[0].table.body.length).toBe(1);
            expect(doc.content[0].table.body[0].length).toBe(4); // relleno hasta 4
        });

        it('B) 4 Gift Cards → exactamente 1 fila completa', async () => {
            await setup(Array.from({ length: 4 }, (_, i) => makeCard(`GC-00000${i + 1}`)));
            const doc = await run(catalog);
            expect(doc.content[0].table.body.length).toBe(1);
        });

        it('C) 5 → 4 + 1 (dos filas)', async () => {
            await setup(Array.from({ length: 5 }, (_, i) => makeCard(`GC-00000${i + 1}`)));
            const doc = await run(catalog);
            expect(doc.content[0].table.body.length).toBe(2);
        });

        it('D) 8 → 4 + 4 (dos filas completas)', async () => {
            await setup(Array.from({ length: 8 }, (_, i) => makeCard(`GC-00000${i + 1}`)));
            const doc = await run(catalog);
            expect(doc.content[0].table.body.length).toBe(2);
        });

        it('E) 10 → 4 + 4 + 2 (tres filas)', async () => {
            await setup(Array.from({ length: 10 }, (_, i) => makeCard(`GC-${String(i + 1).padStart(6, '0')}`)));
            const doc = await run(catalog);
            expect(doc.content[0].table.body.length).toBe(3);
        });

        it('F) 13 → 4 + 4 + 4 + 1 (cuatro filas)', async () => {
            await setup(Array.from({ length: 13 }, (_, i) => makeCard(`GC-${String(i + 1).padStart(6, '0')}`)));
            const doc = await run(catalog);
            expect(doc.content[0].table.body.length).toBe(4);
        });

        it('H) cada celda usa exactamente card.cardCode como texto (y por lo tanto como contenido del barcode)', async () => {
            await setup([makeCard('GC-000001'), makeCard('GC-000002')]);
            const doc = await run(catalog);
            const texts = doc.content[0].table.body
                .flat()
                .map((cell) => (cell as { stack?: { text: string }[] }).stack?.[1]?.text)
                .filter((t): t is string => !!t);
            expect(texts).toEqual(['GC-000001', 'GC-000002']);
        });

        it('I) un código histórico/manual (no GC-NNNNNN) también genera su etiqueta', async () => {
            await setup([makeCard('GC100-0001'), makeCard('ABCD1234XYZ')]);
            const doc = await run(catalog);
            const texts = doc.content[0].table.body
                .flat()
                .map((cell) => (cell as { stack?: { text: string }[] }).stack?.[1]?.text)
                .filter((t): t is string => !!t);
            expect(texts).toEqual(['GC100-0001', 'ABCD1234XYZ']);
        });

        it('J) el PDF NO contiene amountCents/monto/precio en ningún lado del documento', async () => {
            await setup([makeCard('GC-000001', 'AVAILABLE')]);
            const doc = await run(catalog);

            // Solo los textos de cada celda (barcode + código) — el dataURL del
            // barcode es base64 y puede contener cualquier subcadena por azar,
            // así que no se analiza aquí.
            const texts = doc.content[0].table.body
                .flat()
                .map((cell) => (cell as { stack?: { text?: string }[] }).stack)
                .filter((stack): stack is { text?: string }[] => !!stack)
                .flatMap((stack) => stack.map((node) => node.text).filter((t): t is string => !!t));

            expect(texts).toEqual(['GC-000001']); // nunca "Bs 250", nunca "25000"
            for (const t of texts) {
                expect(t).not.toContain('25000'); // amountCents del fixture
                expect(t.toLowerCase()).not.toContain('bs');
            }
            // Cada celda del cuerpo tiene como máximo 2 elementos: barcode + código.
            for (const cell of doc.content[0].table.body.flat()) {
                const stack = (cell as { stack?: unknown[] }).stack;
                if (stack) expect(stack.length).toBe(2);
            }
        });

        it('mantiene la geometría aprobada de Productos: Carta, 4 columnas, ancho de etiqueta y centrado exactos', async () => {
            await setup(Array.from({ length: 4 }, (_, i) => makeCard(`GC-00000${i + 1}`)));
            const doc = await run(catalog);

            expect(doc.pageSize).toBe('LETTER');
            expect(doc.content[0].table.widths.length).toBe(4);

            const expectedWidthPt = LABEL_SIZE_MM.width * MM_TO_PT;
            for (const width of doc.content[0].table.widths) {
                expect(width).toBeCloseTo(expectedWidthPt, 6);
            }

            const [left, top, right, bottom] = doc.pageMargins;
            expect(left).toBeCloseTo(right, 9); // centrado exacto, igual que Productos
            expect(top).toBeCloseTo(10 * MM_TO_PT, 6);
            expect(bottom).toBeCloseTo(10 * MM_TO_PT, 6);

            const tableWidth = doc.content[0].table.widths.reduce((a, b) => a + b, 0);
            expect(left + tableWidth + right).toBeCloseTo(LETTER_WIDTH_PT, 6);

            for (let i = 0; i < 4; i++) {
                expect(doc.content[0].layout.paddingLeft(i)).toBe(0);
                expect(doc.content[0].layout.paddingRight(i)).toBe(0);
            }
        });
    });
});
