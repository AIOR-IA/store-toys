import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { BarcodeSvgComponent } from '@shared/components/ui';
import { ToastService } from '@core/services';
import { BarcodeFormat, toJsBarcodeFormat } from '@core/utils';
import { LABEL_SIZE_MM } from '../../label-size.const';
import { Product } from '../../product.model';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Impresión de una sola etiqueta (prompt §7, §8): abre una ventana nueva con
 * SOLO el contenido de la etiqueta — nada de sidebar, topbar, botones ni
 * formulario — y dispara `print()` ahí. Es más simple y más confiable que
 * pelear con CSS de impresión global contra el layout completo de la app
 * (sidebar/topbar encapsulados), y da control total sobre el tamaño físico
 * en mm (`@page { size: 50mm 30mm }`), sin depender de píxeles.
 *
 * El tamaño vive en `LABEL_SIZE_MM`: cambiarlo no toca esta lógica.
 */
@Component({
    selector: 'app-product-label-dialog',
    standalone: true,
    imports: [CommonModule, DialogModule, ButtonModule, TranslateModule, BarcodeSvgComponent],
    templateUrl: './product-label-dialog.component.html',
})
export class ProductLabelDialogComponent {
    private readonly toast = inject(ToastService);

    product = input<Product | null>(null);
    closed = output<void>();

    readonly visible = computed(() => this.product() !== null);
    readonly labelSize = LABEL_SIZE_MM;

    close(): void {
        this.closed.emit();
    }

    async print(): Promise<void> {
        const product = this.product();
        if (!product) return;

        const printWindow = window.open('', '_blank', 'width=400,height=300');
        if (!printWindow) {
            this.toast.error('app.common.errors.general');
            return;
        }

        const svgMarkup = await this.renderBarcodeSvg(
            product.code,
            product.barcodeFormat,
        );
        printWindow.document.write(this.buildPrintHtml(product, svgMarkup));
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
        };
    }

    private async renderBarcodeSvg(
        code: string,
        format: BarcodeFormat,
    ): Promise<string> {
        const mod: unknown = await import('jsbarcode');
        const JsBarcode = (mod as { default?: unknown }).default as (
            el: SVGElement,
            text: string,
            opts: Record<string, unknown>,
        ) => void;

        const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg',
        );
        const options = { displayValue: false, width: 2, height: 40, margin: 0 };
        try {
            JsBarcode(svg, code, { ...options, format: toJsBarcodeFormat(format) });
        } catch {
            JsBarcode(svg, code, { ...options, format: 'CODE128' });
        }
        return new XMLSerializer().serializeToString(svg);
    }

    private buildPrintHtml(product: Product, svgMarkup: string): string {
        const { width, height } = LABEL_SIZE_MM;
        return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(product.code)}</title><style>
            @page { size: ${width}mm ${height}mm; margin: 0; }
            html, body { margin: 0; padding: 0; }
            body {
                width: ${width}mm; height: ${height}mm; box-sizing: border-box;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                font-family: Arial, Helvetica, sans-serif; padding: 2mm; overflow: hidden;
            }
            svg { width: 90%; height: auto; }
            .code-text { font-size: 8pt; letter-spacing: 1px; margin-top: 1mm; }
            .name-text {
                font-size: 7pt; text-align: center; width: 100%;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
        </style></head><body>
            ${svgMarkup}
            <div class="code-text">${escapeHtml(product.code)}</div>
            <div class="name-text">${escapeHtml(product.name)}</div>
        </body></html>`;
    }
}
