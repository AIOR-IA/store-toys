import {
    AfterViewInit,
    Component,
    ElementRef,
    OnChanges,
    ViewChild,
    input,
} from '@angular/core';
import { BarcodeFormat, toJsBarcodeFormat } from '@core/utils';

/**
 * Renderiza un código de barras como SVG (plan §14.2: "preferentemente
 * renderizar SVG para mantener nitidez al imprimir").
 *
 * `jsbarcode` se carga con `import()` dinámico: es una librería pequeña,
 * pero solo la usan la vista previa del formulario y la impresión de
 * etiquetas — no tiene sentido pagarla en el bundle inicial de toda la app.
 */
@Component({
    selector: 'app-barcode-svg',
    standalone: true,
    template: `<svg #svg></svg>`,
})
export class BarcodeSvgComponent implements AfterViewInit, OnChanges {
    code = input.required<string>();
    format = input<BarcodeFormat>('CODE128');
    displayValue = input<boolean>(true);
    width = input<number>(2);
    height = input<number>(60);
    fontSize = input<number>(14);

    @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGElement>;

    private rendered = false;

    ngAfterViewInit(): void {
        this.rendered = true;
        void this.render();
    }

    ngOnChanges(): void {
        if (this.rendered) {
            void this.render();
        }
    }

    private async render(): Promise<void> {
        if (!this.code()) return;
        const mod: unknown = await import('jsbarcode');
        const JsBarcode = (mod as { default?: unknown }).default as (
            el: SVGElement,
            text: string,
            opts: Record<string, unknown>,
        ) => void;

        const options = {
            displayValue: this.displayValue(),
            width: this.width(),
            height: this.height(),
            fontSize: this.fontSize(),
            margin: 4,
        };

        try {
            JsBarcode(this.svgRef.nativeElement, this.code(), {
                ...options,
                format: toJsBarcodeFormat(this.format()),
            });
        } catch {
            // Un código de fabricante con dígito verificador inválido no
            // debe dejar la vista previa en blanco: CODE 128 acepta
            // cualquier alfanumérico sin exigir checksum (plan §14.3).
            JsBarcode(this.svgRef.nativeElement, this.code(), {
                ...options,
                format: 'CODE128',
            });
        }
    }
}
