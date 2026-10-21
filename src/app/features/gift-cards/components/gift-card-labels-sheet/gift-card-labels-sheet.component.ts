import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import {
    CardsPaginatorComponent,
    FilterTabComponent,
    FilterTabOption,
    ItemsNotFoundComponent,
    SearchBarComponent,
    SpinnerComponent,
    TitleBarComponent,
} from '@shared/components/ui';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, PageSize } from '@core/data';
import { ToastService } from '@core/services';
import { normalizeGiftCardCode } from '@core/utils';
import { LABEL_SIZE_MM, SAME_BARCODE_DEBOUNCE_MS } from '@shared/constants';
import { MoneyPipe } from '@shared/pipes';
import { GiftCardsFilter, GiftCardsService } from '../../gift-cards.service';
import { GiftCard } from '../../gift-card.model';

/**
 * Geometría del PDF de etiquetas (ajuste posterior, prompt "Gift Cards:
 * etiquetas masivas"): MISMA geometría ya aprobada visualmente en
 * `ProductLabelsSheetComponent` (Carta, 4 columnas, centrado exacto). Se
 * decidió a propósito NO extraerla a un helper compartido: Productos acaba de
 * pasar por tres rondas de ajuste fino (columnas, centrado) ya aprobadas, y
 * tocar ese archivo de nuevo para una extracción sin beneficio funcional para
 * Productos es un riesgo de regresión innecesario. Se copian aquí las MISMAS
 * constantes/fórmula — "implementaciones separadas, mismas constantes" es
 * exactamente lo que el prompt autorizó como aceptable si compartir agrega
 * riesgo. Si en el futuro se vuelve a tocar la geometría de ambas pantallas
 * a la vez, ese es el momento natural de extraerla.
 */
const MM_TO_PT = 2.834645669;
/** Vertical sin cambios respecto a Productos: el ajuste de columnas es solo horizontal. */
const PAGE_MARGIN_VERTICAL_MM = 10;
/** Igual que en Productos: piso de seguridad solo para decidir cuántas columnas entran. */
const MIN_PAGE_MARGIN_HORIZONTAL_MM = 5;
/** Carta/Letter en mm — pdfmake mide en puntos, la conversión vive solo aquí. */
const PAGE_SIZE_MM = { width: 215.9, height: 279.4 };

/**
 * Hoja de etiquetas de Gift Cards (ajuste posterior): selección múltiple de
 * tarjetas ya registradas, un PDF en hoja Carta con la misma geometría
 * aprobada de `ProductLabelsSheetComponent` (4 columnas, centrado exacto,
 * mismo ancho físico de etiqueta).
 *
 * Diferencias deliberadas respecto a Productos (regla de negocio de Gift
 * Cards, no un descuido):
 * - 1 tarjeta seleccionada = 1 etiqueta. No hay "cantidad por tarjeta": cada
 *   código físico es único, a diferencia de un producto que puede repetirse
 *   en N etiquetas idénticas.
 * - La etiqueta NUNCA imprime el monto, el estado, el comprador, el vendedor
 *   ni el ciclo — todo eso es historia comercial que vive en el sistema, no
 *   en el plástico, porque `amountCents` es editable y la tarjeta se
 *   reutiliza (CLAUDE.md, "Gift Cards: identidad ≠ monto"). Solo el barcode
 *   y el código van al papel — igual que ya hace
 *   `GiftCardLabelDialogComponent` para la impresión individual.
 * - `CANCELLED` es baja definitiva (CLAUDE.md): ese código no debe volver a
 *   imprimirse para circular de nuevo, así que no es seleccionable aquí. Una
 *   tarjeta `ACTIVE` nacida de un reemplazo SÍ es seleccionable — es un
 *   código físico nuevo recién entregado al cliente, no distinto de
 *   cualquier otra `ACTIVE` para efectos de esta pantalla.
 */
@Component({
    selector: 'app-gift-card-labels-sheet',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        CheckboxModule,
        TagModule,
        TranslateModule,
        TitleBarComponent,
        SpinnerComponent,
        ItemsNotFoundComponent,
        CardsPaginatorComponent,
        FilterTabComponent,
        SearchBarComponent,
        MoneyPipe,
    ],
    templateUrl: './gift-card-labels-sheet.component.html',
})
export class GiftCardLabelsSheetComponent implements OnInit {
    private readonly giftCardsService = inject(GiftCardsService);
    private readonly toast = inject(ToastService);

    readonly filterOptions: FilterTabOption<GiftCardsFilter>[] = [
        { label: 'app.giftCards.filters.all', icon: 'fas fa-gift', value: 'all' },
        {
            label: 'app.giftCards.status.available',
            icon: 'fas fa-circle-check',
            value: 'AVAILABLE',
        },
        { label: 'app.giftCards.status.active', icon: 'fas fa-bolt', value: 'ACTIVE' },
        {
            label: 'app.giftCards.status.suspended',
            icon: 'fas fa-triangle-exclamation',
            value: 'SUSPENDED',
        },
    ];
    readonly pageSizeOptions: PageSize[] = PAGE_SIZE_OPTIONS;

    filter = signal<GiftCardsFilter>('all');
    pageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);

    loading = signal(true);
    /** Evita montar el paginador antes de la primera carga (mismo patrón que Productos). */
    hasLoadedOnce = signal(false);
    generating = signal(false);

    rows = signal<GiftCard[]>([]);
    total = signal(0);
    hasNext = signal(false);
    hasPrev = signal(false);
    /** `true` cuando `rows` viene de un lookup exacto por código, no del paginador. */
    singleResultMode = signal(false);

    /** Selección global (todas las páginas/búsquedas), por `cardCode`. */
    selection = signal<ReadonlyMap<string, GiftCard>>(new Map());

    readonly hasSelection = computed(() => this.selection().size > 0);
    readonly selectedCount = computed(() => this.selection().size);

    private pager = this.createPager();
    private readonly lastLookupAt = new Map<string, number>();

    ngOnInit(): void {
        this.loadFirstPage();
    }

    /**
     * `CANCELLED` es baja definitiva (CLAUDE.md): ese código no vuelve a
     * circular, así que no entra en un lote nuevo de etiquetas físicas.
     * Cualquier otro estado (incluida una `ACTIVE` nacida de un reemplazo)
     * sí puede necesitar su etiqueta física.
     */
    isSelectable(card: GiftCard): boolean {
        return card.status !== 'CANCELLED';
    }

    isSelected(card: GiftCard): boolean {
        return this.selection().has(card.cardCode);
    }

    toggleSelected(card: GiftCard, selected: boolean): void {
        if (selected && !this.isSelectable(card)) return;

        const next = new Map(this.selection());
        if (selected) {
            next.set(card.cardCode, card);
        } else {
            next.delete(card.cardCode);
        }
        this.selection.set(next);
    }

    onFilterChange(filter: GiftCardsFilter): void {
        this.filter.set(filter);
        this.singleResultMode.set(false);
        this.loadFirstPage();
    }

    onSearch(term: string): void {
        const normalized = normalizeGiftCardCode(term);

        if (!normalized) {
            this.singleResultMode.set(false);
            this.loadFirstPage();
            return;
        }

        const now = Date.now();
        const lastAt = this.lastLookupAt.get(normalized);
        if (lastAt !== undefined && now - lastAt < SAME_BARCODE_DEBOUNCE_MS) return;
        this.lastLookupAt.set(normalized, now);

        this.loading.set(true);
        this.giftCardsService.lookupByCode(normalized).subscribe({
            next: (card) => {
                if (card) {
                    this.rows.set([card]);
                    this.total.set(1);
                    this.hasNext.set(false);
                    this.hasPrev.set(false);
                    this.singleResultMode.set(true);
                    this.loading.set(false);
                    this.hasLoadedOnce.set(true);
                } else {
                    this.singleResultMode.set(false);
                    this.loadFirstPage();
                }
            },
            error: () => this.onLoadError(),
        });
    }

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
        return this.giftCardsService.createPager(this.filter(), this.pageSize());
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
        rows: GiftCard[];
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
        // Orden determinista: el de inserción del Map, que es el orden en que
        // se fueron marcando los checkboxes (prompt §13: "no ordenar por monto").
        const cards = Array.from(this.selection().values());
        if (!cards.length) return;

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
            // Mismo motivo que en Productos: el layout 'noBorders' de pdfmake
            // agrega padding horizontal oculto entre columnas (docMeasure.js:
            // getOffsets), que descentraría el bloque. El layout propio de abajo
            // lo elimina para poder centrar con el ancho real exacto.
            const tableWidthPt = columns * labelWidthPt;
            const marginHorizontalPt = (pageWidthPt - tableWidthPt) / 2;

            const cells = cards.map((card) => this.buildLabelCell(card, JsBarcode, labelWidthPt));
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
                            layout: {
                                hLineWidth: () => 0,
                                vLineWidth: () => 0,
                                paddingLeft: () => 0,
                                paddingRight: () => 0,
                            },
                        },
                    ],
                })
                .download('etiquetas-gift-cards-mi-pimpollito.pdf');
        } catch {
            this.toast.error('app.common.errors.general');
        } finally {
            this.generating.set(false);
        }
    }

    /**
     * Solo barcode + código (prompt §3-§4): nunca monto, estado, comprador,
     * vendedor, ciclo ni "replacement" — esa historia vive en el sistema, no
     * en el plástico. El código de una Gift Card nunca es un EAN/UPC real
     * (mismo comentario que `GiftCardLabelDialogComponent`), así que el
     * formato es SIEMPRE CODE128 — funciona igual con el formato nuevo
     * (`GC-000001`) que con códigos históricos/manuales (`GC100-0001`,
     * `ABCD1234XYZ`): no se interpreta ni se extrae nada del texto del código.
     */
    private buildLabelCell(
        card: GiftCard,
        JsBarcode: (
            el: HTMLCanvasElement,
            text: string,
            opts: Record<string, unknown>,
        ) => void,
        widthPt: number,
    ): unknown {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, card.cardCode, {
            displayValue: false,
            width: 2,
            height: 50,
            margin: 0,
            format: 'CODE128',
        });
        const dataUrl = canvas.toDataURL('image/png');

        return {
            stack: [
                {
                    image: dataUrl,
                    width: widthPt * 0.85,
                    alignment: 'center',
                    margin: [0, 4, 0, 2],
                },
                { text: card.cardCode, fontSize: 7, alignment: 'center' },
            ],
            margin: [2, 2, 2, 2],
            border: [false, false, false, false],
        };
    }
}
