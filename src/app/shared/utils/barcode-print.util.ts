import { BarcodeFormat, toJsBarcodeFormat } from '@core/utils';
import { LABEL_SIZE_MM } from '@shared/constants';

/**
 * Impresión de UNA etiqueta con barcode (extraído de
 * `ProductLabelDialogComponent`, plan §14.2, prompt Fase 6-bis §13: "reutilizar
 * todo lo razonable... no duplicar innecesariamente otra implementación
 * completa de barcode"). Abre una ventana nueva con SOLO el contenido de la
 * etiqueta — nada de sidebar, topbar, botones ni formulario — y dispara
 * `print()` ahí: es más simple y más confiable que pelear con CSS de
 * impresión global contra el layout completo de la app, y da control total
 * sobre el tamaño físico en mm (`@page { size: ... }`), sin depender de
 * píxeles.
 *
 * Genérico sobre `code`/`format`/`primaryText`/`secondaryText` para que
 * Productos (código + nombre) y Gift Cards (código + denominación) compartan
 * la MISMA implementación en vez de dos copias del mismo mecanismo de
 * barcode + ventana de impresión.
 */
export interface PrintBarcodeLabelInput {
    code: string;
    format?: BarcodeFormat;
    primaryText: string;
    secondaryText?: string;
    sizeMm?: { width: number; height: number };
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function renderBarcodeSvg(code: string, format: BarcodeFormat): Promise<string> {
    const mod: unknown = await import('jsbarcode');
    const JsBarcode = (mod as { default?: unknown }).default as (
        el: SVGElement,
        text: string,
        opts: Record<string, unknown>,
    ) => void;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const options = { displayValue: false, width: 2, height: 40, margin: 0 };
    try {
        JsBarcode(svg, code, { ...options, format: toJsBarcodeFormat(format) });
    } catch {
        JsBarcode(svg, code, { ...options, format: 'CODE128' });
    }
    return new XMLSerializer().serializeToString(svg);
}

function buildPrintHtml(input: Required<Pick<PrintBarcodeLabelInput, 'code' | 'primaryText'>> & {
    secondaryText?: string;
    sizeMm: { width: number; height: number };
    svgMarkup: string;
}): string {
    const { width, height } = input.sizeMm;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(input.code)}</title><style>
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
        ${input.svgMarkup}
        <div class="code-text">${escapeHtml(input.primaryText)}</div>
        ${input.secondaryText ? `<div class="name-text">${escapeHtml(input.secondaryText)}</div>` : ''}
    </body></html>`;
}

/** `null` si el navegador bloqueó la ventana emergente (el caller decide cómo avisar). */
export async function printBarcodeLabel(input: PrintBarcodeLabelInput): Promise<boolean> {
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (!printWindow) return false;

    const format = input.format ?? 'CODE128';
    const sizeMm = input.sizeMm ?? LABEL_SIZE_MM;
    const svgMarkup = await renderBarcodeSvg(input.code, format);

    printWindow.document.write(
        buildPrintHtml({
            code: input.code,
            primaryText: input.primaryText,
            secondaryText: input.secondaryText,
            sizeMm,
            svgMarkup,
        }),
    );
    printWindow.document.close();
    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
    };
    return true;
}
