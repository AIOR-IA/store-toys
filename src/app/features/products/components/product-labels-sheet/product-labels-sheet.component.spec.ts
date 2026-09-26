import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { ToastService } from '@core/services';
import { CursorPager, PageResult, PageSize } from '@core/data';
import { ProductsService } from '../../products.service';
import { Product } from '../../product.model';
import {
    ProductLabelsSheetComponent,
    sanitizeQuantity,
} from './product-labels-sheet.component';

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const makeProduct = (n: number): Product =>
    ({
        id: `p${n}`,
        name: `Producto ${n}`,
        code: `MP${String(n).padStart(6, '0')}`,
        codeSource: 'internal',
        barcodeFormat: 'CODE128',
        // El producto 2 no tiene imagen real: no debe abrir el visor.
        imageUrl: n === 2 ? '' : PIXEL,
        isActive: true,
    }) as unknown as Product;

const CATALOG = Array.from({ length: 23 }, (_, i) => makeProduct(i + 1));

/** Paginador en memoria con el mismo contrato que `CursorPager` (sin Firestore). */
class FakePager {
    private index = 0;
    constructor(public pageSize: PageSize) {}
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
    private page(): PageResult<Product> {
        const from = this.index * this.pageSize;
        return {
            rows: CATALOG.slice(from, from + this.pageSize),
            hasNext: from + this.pageSize < CATALOG.length,
            hasPrev: this.index > 0,
            total: CATALOG.length,
        };
    }
}

describe('sanitizeQuantity', () => {
    it('acota a enteros entre 1 y 999', () => {
        expect(sanitizeQuantity(5)).toBe(5);
        expect(sanitizeQuantity(null)).toBe(1);
        expect(sanitizeQuantity(NaN)).toBe(1);
        expect(sanitizeQuantity(0)).toBe(1);
        expect(sanitizeQuantity(-3)).toBe(1);
        expect(sanitizeQuantity(2.9)).toBe(2);
        expect(sanitizeQuantity(5000)).toBe(999);
    });
});

describe('ProductLabelsSheetComponent — paginación y selección global', () => {
    let component: ProductLabelsSheetComponent;
    let fixture: ComponentFixture<ProductLabelsSheetComponent>;
    let createPager: jasmine.Spy;
    let pagers: FakePager[];

    const flush = () => new Promise((r) => setTimeout(r));
    const product = (n: number) => CATALOG[n - 1];

    beforeEach(async () => {
        pagers = [];
        createPager = jasmine
            .createSpy('createPager')
            .and.callFake((_f: string, _t: string, size: PageSize) => {
                const pager = new FakePager(size);
                pagers.push(pager);
                return pager as unknown as CursorPager<Product>;
            });

        await TestBed.configureTestingModule({
            imports: [ProductLabelsSheetComponent, TranslateModule.forRoot()],
            providers: [
                provideHttpClient(),
                { provide: ProductsService, useValue: { createPager } },
                { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(ProductLabelsSheetComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
        await flush();
        fixture.detectChanges();
    });

    it('primera carga: 10 por defecto, productos activos por nombre, una sola consulta', () => {
        // El pager de la propiedad + el que crea `loadFirstPage` en ngOnInit.
        const last = createPager.calls.mostRecent().args;
        expect(last).toEqual(['active', '', 10, 0]);
        expect(component.rows().length).toBe(10);
        expect(pagers[pagers.length - 1].first).toHaveBeenCalledTimes(1);
        expect(component.pageSizeOptions).toEqual([5, 10, 15]);
    });

    it('la selección y las cantidades sobreviven a cambiar de página', async () => {
        component.toggleSelected(product(1), true);
        component.setQuantity(product(1), 3);

        component.onNextPage();
        await flush();
        expect(component.rows()[0].id).toBe('p11');
        component.toggleSelected(product(12), true);
        component.setQuantity(product(12), 2);

        component.onPrevPage();
        await flush();
        expect(component.isSelected(product(1))).toBeTrue();
        expect(component.quantityOf(product(1))).toBe(3);

        component.setQuantity(product(1), 5);
        expect(component.quantityOf(product(1))).toBe(5);
        expect(component.selectedCount()).toBe(2);
        expect(component.labelsCount()).toBe(7);
    });

    it('cambiar el tamaño de página reinicia el cursor pero conserva la selección', async () => {
        component.toggleSelected(product(1), true);
        component.setQuantity(product(1), 4);

        component.onPageSizeChange(5);
        await flush();
        expect(component.rows().length).toBe(5);
        expect(createPager.calls.mostRecent().args[2]).toBe(5);

        component.onPageSizeChange(15);
        await flush();
        expect(component.rows().length).toBe(15);
        expect(component.isSelected(product(1))).toBeTrue();
        expect(component.quantityOf(product(1))).toBe(4);
    });

    it('desmarcar lo elimina de la selección global', () => {
        component.toggleSelected(product(1), true);
        component.toggleSelected(product(2), true);
        component.toggleSelected(product(1), false);

        expect(component.isSelected(product(1))).toBeFalse();
        expect(component.selectedCount()).toBe(1);
    });

    it('marcar de nuevo un producto ya seleccionado no pisa su cantidad', () => {
        component.toggleSelected(product(1), true);
        component.setQuantity(product(1), 6);
        component.toggleSelected(product(1), true);
        expect(component.quantityOf(product(1))).toBe(6);
    });

    it('cantidades inválidas se corrigen al mínimo o al máximo', () => {
        component.toggleSelected(product(1), true);
        component.setQuantity(product(1), null);
        expect(component.quantityOf(product(1))).toBe(1);
        component.setQuantity(product(1), -2);
        expect(component.quantityOf(product(1))).toBe(1);
        component.setQuantity(product(1), 1200);
        expect(component.quantityOf(product(1))).toBe(999);
    });

    it('Generar PDF usa la selección de TODAS las páginas, con sus cantidades', async () => {
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: { content: { table: { body: unknown[][] } }[] } | undefined;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: typeof doc) => {
            doc = d;
            return { download: () => undefined };
        }) as never);

        component.toggleSelected(product(1), true); // página 1
        component.setQuantity(product(1), 3);
        component.onNextPage();
        await flush();
        component.toggleSelected(product(12), true); // página 2
        component.setQuantity(product(12), 2);
        component.onNextPage();
        await flush();
        component.toggleSelected(product(21), true); // página 3, la visible

        await component.generatePdf();

        const names = doc!.content[0].table.body
            .flat()
            .map((cell) => (cell as { stack?: { text: string }[] }).stack?.[2]?.text)
            .filter((t): t is string => !!t);
        expect(names).toEqual([
            'PRODUCTO 1',
            'PRODUCTO 1',
            'PRODUCTO 1',
            'PRODUCTO 12',
            'PRODUCTO 12',
            'PRODUCTO 21',
        ]);
    });

    it('muestra el nombre en MAYÚSCULAS sin alterar el dato del producto', () => {
        const el = fixture.nativeElement as HTMLElement;
        const names = [...el.querySelectorAll('p-checkbox')].map((c) =>
            c.closest('div.flex')!.children[2].textContent!.trim(),
        );
        expect(names[0]).toBe('PRODUCTO 1');
        expect(component.rows()[0].name).toBe('Producto 1');
    });

    describe('visor de imagen', () => {
        const thumb = (i: number) =>
            (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLImageElement>('img.w-8')[i];

        it('click en la miniatura abre el visor con esa imagen, sin tocar checkbox ni cantidad', () => {
            component.toggleSelected(product(1), true);
            component.setQuantity(product(1), 3);
            fixture.detectChanges();

            thumb(0).click();
            fixture.detectChanges();

            expect(component.viewerSrc()).toBe(PIXEL);
            expect(component.isSelected(product(1))).toBeTrue();
            expect(component.quantityOf(product(1))).toBe(3);
            expect(component.selectedCount()).toBe(1);
        });

        it('click en la miniatura de un producto NO seleccionado no lo selecciona', () => {
            thumb(2).click();
            fixture.detectChanges();
            expect(component.viewerSrc()).toBe(PIXEL);
            expect(component.selectedCount()).toBe(0);
        });

        it('producto sin imagen real: no abre el visor', () => {
            thumb(1).click(); // producto 2
            fixture.detectChanges();
            expect(component.viewerSrc()).toBeNull();
        });

        it('cerrar el visor conserva selección, cantidad y página', async () => {
            component.toggleSelected(product(1), true);
            component.setQuantity(product(1), 3);
            component.onNextPage();
            await flush();
            fixture.detectChanges();

            thumb(0).click();
            fixture.detectChanges();
            expect(component.viewerSrc()).toBe(PIXEL);
            component.viewerSrc.set(null); // (closed) del visor
            fixture.detectChanges();

            expect(component.rows()[0].id).toBe('p11');
            expect(component.isSelected(product(1))).toBeTrue();
            expect(component.quantityOf(product(1))).toBe(3);
        });
    });
});
