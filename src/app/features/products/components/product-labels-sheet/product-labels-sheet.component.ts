import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import {
    CardsPaginatorComponent,
    ItemsNotFoundComponent,
    SpinnerComponent,
    TitleBarComponent,
} from '@shared/components/ui';
import { ImageViewerComponent } from '@shared/components/ui/image-viewer/image-viewer.component';
import { ProductImageComponent } from '@shared/components/ui/product-image/product-image.component';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, PageSize } from '@core/data';
import { ToastService } from '@core/services';
import { BarcodeFormat, toJsBarcodeFormat } from '@core/utils';
import { LABEL_SIZE_MM } from '@shared/constants';
import { ProductNamePipe } from '@shared/pipes';
import { formatProductName } from '@shared/utils';
import { ProductsService } from '../../products.service';
import { Product } from '../../product.model';

const MM_TO_PT = 2.834645669;
/** Vertical sin cambios: el ajuste a 4 columnas es solo horizontal. */
const PAGE_MARGIN_VERTICAL_MM = 10;
/**
 * Piso de seguridad SOLO para decidir cuántas columnas entran. El margen que
 * realmente se aplica (`generatePdf`) siempre resulta mayor que esto: se
 * calcula centrando el ancho exacto de la tabla en el espacio sobrante, para
 * que el margen izquierdo y el derecho queden iguales.
 */
const MIN_PAGE_MARGIN_HORIZONTAL_MM = 5;
/** Carta/Letter en mm — pdfmake mide en puntos, la conversión vive solo aquí. */
const PAGE_SIZE_MM = { width: 215.9, height: 279.4 };

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 999;

/** Un producto elegido para la hoja, con cuántas etiquetas se imprimirán. */
interface SelectionEntry {
    product: Product;
    quantity: number;
}

/** Entero entre 1 y 999; `null`/`NaN`/decimales/negativos caen al mínimo válido. */
export function sanitizeQuantity(value: number | null): number {
    if (value === null || !Number.isFinite(value)) return MIN_QUANTITY;
    return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.floor(value)));
}

/**
 * Hoja de etiquetas (plan §14.2, alcance Fase 3): se seleccionan productos
 * del listado, se indica cuántas etiquetas por producto y se genera un PDF
 * en hoja carta con `jsbarcode` (Code 128/EAN → PNG) + `pdfmake`.
 *
 * El listado se pagina por cursores (mismo `CursorPager` que Productos), pero
 * la SELECCIÓN vive aparte de la página visible: un `Map` por id de producto
 * con su cantidad, solo en memoria de esta pantalla (no se guarda en
 * Firestore). Así cambiar de página o de tamaño de página no pierde nada, y
 * "Generar PDF" toma la selección completa, no solo lo que se ve.
 *
 * Ambas librerías se cargan con `import()` dinámico: solo esta pantalla las
 * usa, así que no tiene sentido pagarlas en el bundle inicial de toda la app
 * (`pdfmake` en particular es pesado por sus fuentes empaquetadas).
 */
@Component({
    selector: 'app-product-labels-sheet',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputNumberModule,
        CheckboxModule,
        TranslateModule,
        TitleBarComponent,
        SpinnerComponent,
        ItemsNotFoundComponent,
        CardsPaginatorComponent,
        ImageViewerComponent,
        ProductImageComponent,
        ProductNamePipe,
    ],
    templateUrl: './product-labels-sheet.component.html',
})
export class ProductLabelsSheetComponent implements OnInit {
    private readonly productsService = inject(ProductsService);
    private readonly toast = inject(ToastService);

    readonly pageSizeOptions: PageSize[] = PAGE_SIZE_OPTIONS;
    readonly minQuantity = MIN_QUANTITY;
    readonly maxQuantity = MAX_QUANTITY;

    loading = signal(true);
    /** Evita montar el paginador antes de la primera carga (ver template). */
    hasLoadedOnce = signal(false);
    generating = signal(false);
    /** URL de la imagen abierta en el visor; `null` = cerrado (mismo patrón que el listado). */
    viewerSrc = signal<string | null>(null);

    pageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);
    rows = signal<Product[]>([]);
    total = signal(0);
    hasNext = signal(false);
    hasPrev = signal(false);

    /** Selección global (todas las páginas), por `product.id`. */
    selection = signal<ReadonlyMap<string, SelectionEntry>>(new Map());

    readonly hasSelection = computed(() => this.selection().size > 0);
    readonly selectedCount = computed(() => this.selection().size);
    readonly labelsCount = computed(() => {
        let sum = 0;
        for (const entry of this.selection().values()) sum += entry.quantity;
        return sum;
    });

    private pager = this.createPager();

    ngOnInit(): void {
        this.loadFirstPage();
    }

    isSelected(product: Product): boolean {
        return this.selection().has(product.id);
    }

    quantityOf(product: Product): number {
        return this.selection().get(product.id)?.quantity ?? MIN_QUANTITY;
    }

    toggleSelected(product: Product, selected: boolean): void {
        const next = new Map(this.selection());
        if (selected) {
            // Si ya estaba seleccionado no se pisa su cantidad.
            if (!next.has(product.id)) {
                next.set(product.id, { product, quantity: MIN_QUANTITY });
            }
        } else {
            next.delete(product.id);
        }
        this.selection.set(next);
    }

    setQuantity(product: Product, quantity: number | null): void {
        const current = this.selection().get(product.id);
        if (!current) return;

        const next = new Map(this.selection());
        next.set(product.id, {
            product: current.product,
            quantity: sanitizeQuantity(quantity),
        });
        this.selection.set(next);
    }

    /** Cambiar el tamaño reinicia solo el cursor de la lista: la selección se conserva. */
    onPageSizeChange(pageSize: number): void {
        this.pageSize.set(pageSize as PageSize);
        this.loadFirstPage();
    }

    goToFirstPage(): void {
        this.loadFirstPage();
    }

    onNextPage(): void {
        this.loading.set(true);
        this.pager
            .next()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    onPrevPage(): void {
        this.loading.set(true);
        this.pager
            .prev()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    private createPager() {
        // Productos activos por nombre: misma consulta (y mismo índice) que el
        // filtro "Activos" del listado. El umbral de stock bajo no aplica aquí.
        return this.productsService.createPager('active', '', this.pageSize(), 0);
    }

    private loadFirstPage(): void {
        this.loading.set(true);
        this.pager = this.createPager();
        this.pager
            .first()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    private applyResult(result: {
        rows: Product[];
        hasNext: boolean;
        hasPrev: boolean;
        total: number;
    }): void {
        this.rows.set(result.rows);
        this.hasNext.set(result.hasNext);
        this.hasPrev.set(result.hasPrev);
        this.total.set(result.total);
        this.loading.set(false);
        this.hasLoadedOnce.set(true);
    }

    private onLoadError(): void {
        this.loading.set(false);
        this.hasLoadedOnce.set(true);
        this.toast.error('app.common.errors.general');
    }

    async generatePdf(): Promise<void> {
        const instances: Product[] = [];
        for (const { product, quantity } of this.selection().values()) {
            for (let i = 0; i < quantity; i++) instances.push(product);
        }
        if (!instances.length) return;

        this.generating.set(true);
        try {
            const [jsBarcodeMod, pdfMakeMod, vfsFontsMod] = await Promise.all([
                import('jsbarcode'),
                import('pdfmake/build/pdfmake'),
                import('pdfmake/build/vfs_fonts'),
            ]);
            const JsBarcode = (jsBarcodeMod as { default?: unknown }).default as (
                el: HTMLCanvasElement,
                text: string,
                opts: Record<string, unknown>,
            ) => void;
            const pdfMake = (pdfMakeMod as { default?: Record<string, unknown> })
                .default as {
                createPdf: (doc: unknown) => { download: (name: string) => void };
                addVirtualFileSystem: (vfs: unknown) => void;
            };
            const vfs = (vfsFontsMod as { default?: unknown }).default ?? vfsFontsMod;
            pdfMake.addVirtualFileSystem(vfs);

            const labelWidthPt = LABEL_SIZE_MM.width * MM_TO_PT;
            const pageWidthPt = PAGE_SIZE_MM.width * MM_TO_PT;
            const marginVerticalPt = PAGE_MARGIN_VERTICAL_MM * MM_TO_PT;
            const minMarginHorizontalPt = MIN_PAGE_MARGIN_HORIZONTAL_MM * MM_TO_PT;
            const columns = Math.max(
                1,
                Math.floor((pageWidthPt - minMarginHorizontalPt * 2) / labelWidthPt),
            );
            // El layout de tabla por defecto de pdfmake ('noBorders') agrega 4pt de
            // padding entre columnas (docMeasure.js: getOffsets), lo que ensanchaba
            // la tabla más allá de columns*labelWidthPt y descentraba el bloque
            // hacia la derecha. El layout propio de abajo lo elimina: el único
            // espacio entre etiquetas vuelve a ser el `margin` de cada celda, que
            // ya vive DENTRO de labelWidthPt. Con eso el ancho real de la tabla es
            // exactamente columns*labelWidthPt y se puede centrar con precisión.
            const tableWidthPt = columns * labelWidthPt;
            const marginHorizontalPt = (pageWidthPt - tableWidthPt) / 2;

            const cells = instances.map((product) =>
                this.buildLabelCell(product, JsBarcode, labelWidthPt),
            );
            const body: unknown[][] = [];
            for (let i = 0; i < cells.length; i += columns) {
                const chunk = cells.slice(i, i + columns);
                while (chunk.length < columns) chunk.push({ text: '' });
                body.push(chunk);
            }

            pdfMake
                .createPdf({
                    pageSize: 'LETTER',
                    pageMargins: [
                        marginHorizontalPt,
                        marginVerticalPt,
                        marginHorizontalPt,
                        marginVerticalPt,
                    ],
                    content: [
                        {
                            table: {
                                widths: Array(columns).fill(labelWidthPt),
                                body,
                            },
                            // Sin bordes y SIN el padding horizontal que agrega
                            // 'noBorders' por defecto (ver nota junto a tableWidthPt).
                            // paddingTop/paddingBottom quedan en su valor por
                            // defecto de pdfmake (2pt): el espaciado vertical no
                            // cambia.
                            layout: {
                                hLineWidth: () => 0,
                                vLineWidth: () => 0,
                                paddingLeft: () => 0,
                                paddingRight: () => 0,
                            },
                        },
                    ],
                })
                .download('etiquetas-mi-pimpollito.pdf');
        } catch {
            this.toast.error('app.common.errors.general');
        } finally {
            this.generating.set(false);
        }
    }

    private buildLabelCell(
        product: Product,
        JsBarcode: (
            el: HTMLCanvasElement,
            text: string,
            opts: Record<string, unknown>,
        ) => void,
        widthPt: number,
    ): unknown {
        const canvas = document.createElement('canvas');
        const options = { displayValue: false, width: 2, height: 50, margin: 0 };
        try {
            JsBarcode(canvas, product.code, {
                ...options,
                format: toJsBarcodeFormat(product.barcodeFormat as BarcodeFormat),
            });
        } catch {
            JsBarcode(canvas, product.code, { ...options, format: 'CODE128' });
        }
        const dataUrl = canvas.toDataURL('image/png');

        return {
            stack: [
                {
                    image: dataUrl,
                    width: widthPt * 0.85,
                    alignment: 'center',
                    margin: [0, 4, 0, 2],
                },
                { text: product.code, fontSize: 7, alignment: 'center' },
                { text: formatProductName(product.name), fontSize: 6, alignment: 'center' },
            ],
            margin: [2, 2, 2, 2],
            border: [false, false, false, false],
        };
    }
}
