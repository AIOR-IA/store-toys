import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { ItemsNotFoundComponent, SpinnerComponent, TitleBarComponent } from '@shared/components/ui';
import { ToastService } from '@core/services';
import { BarcodeFormat, toJsBarcodeFormat } from '@core/utils';
import { LABEL_SIZE_MM } from '@shared/constants';
import { ProductsService } from '../../products.service';
import { Product } from '../../product.model';

const MM_TO_PT = 2.834645669;
const PAGE_MARGIN_MM = 10;
/** Carta/Letter en mm — pdfmake mide en puntos, la conversión vive solo aquí. */
const PAGE_SIZE_MM = { width: 215.9, height: 279.4 };

interface SheetRow {
    product: Product;
    selected: boolean;
    quantity: number;
}

/**
 * Hoja de etiquetas (plan §14.2, alcance Fase 3): se seleccionan productos
 * del listado, se indica cuántas etiquetas por producto y se genera un PDF
 * en hoja carta con `jsbarcode` (Code 128/EAN → PNG) + `pdfmake`.
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
    ],
    templateUrl: './product-labels-sheet.component.html',
})
export class ProductLabelsSheetComponent implements OnInit {
    private readonly productsService = inject(ProductsService);
    private readonly toast = inject(ToastService);

    loading = signal(true);
    generating = signal(false);
    rows = signal<SheetRow[]>([]);

    readonly hasSelection = () => this.rows().some((r) => r.selected && r.quantity > 0);

    ngOnInit(): void {
        this.productsService.listForLabelSheet().subscribe({
            next: (products) => {
                this.rows.set(
                    products.map((product) => ({ product, selected: false, quantity: 1 })),
                );
                this.loading.set(false);
            },
            error: () => {
                this.loading.set(false);
                this.toast.error('app.common.errors.general');
            },
        });
    }

    toggleSelected(row: SheetRow, selected: boolean): void {
        this.rows.update((rows) =>
            rows.map((r) => (r === row ? { ...r, selected } : r)),
        );
    }

    setQuantity(row: SheetRow, quantity: number): void {
        this.rows.update((rows) =>
            rows.map((r) => (r === row ? { ...r, quantity } : r)),
        );
    }

    async generatePdf(): Promise<void> {
        const instances: Product[] = [];
        for (const row of this.rows()) {
            if (row.selected && row.quantity > 0) {
                for (let i = 0; i < row.quantity; i++) instances.push(row.product);
            }
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
            const marginPt = PAGE_MARGIN_MM * MM_TO_PT;
            const usableWidthPt = PAGE_SIZE_MM.width * MM_TO_PT - marginPt * 2;
            const columns = Math.max(1, Math.floor(usableWidthPt / labelWidthPt));

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
                    pageMargins: [marginPt, marginPt, marginPt, marginPt],
                    content: [
                        {
                            table: {
                                widths: Array(columns).fill(labelWidthPt),
                                body,
                            },
                            layout: 'noBorders',
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
                { text: product.name, fontSize: 6, alignment: 'center' },
            ],
            margin: [2, 2, 2, 2],
            border: [false, false, false, false],
        };
    }
}
