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

/**
 * Lifecycle de UN popup de impresión: lo que `cleanupPrintWindow` necesita
 * para deshacer exactamente lo que `printBarcodeLabel` dejó registrado. Vive
 * fuera de la función (no en un closure por llamada) para que una llamada
 * nueva pueda cerrar el popup de la llamada ANTERIOR antes de abrir el suyo
 * (§5: una sola ventana de impresión activa a la vez).
 */
interface PrintWindowState {
    popup: Window;
    handleAfterPrint: (() => void) | null;
    handleOpenerFocus: (() => void) | null;
    /** `true` una vez limpiado — hace que `cleanupPrintWindow` sea idempotente. */
    done: boolean;
}

/** El popup de impresión actualmente abierto (si lo hay). Una sola instancia para toda la app. */
let activePrintWindow: PrintWindowState | null = null;

/**
 * Cierra el popup y retira AMBOS listeners, sin importar desde cuál de las
 * tres rutas se llegue (`afterprint`, foco de vuelta en la ventana principal,
 * o un error antes de imprimir) ni cuántas veces se invoque: la segunda
 * llamada sobre el mismo estado no hace nada (`state.done`). Nunca opera
 * sobre un popup ya cerrado por el usuario (`popup.closed`).
 */
function cleanupPrintWindow(state: PrintWindowState): void {
    if (state.done) return;
    state.done = true;

    if (state.handleOpenerFocus) {
        window.removeEventListener('focus', state.handleOpenerFocus);
        state.handleOpenerFocus = null;
    }
    if (state.handleAfterPrint) {
        try {
            state.popup.removeEventListener('afterprint', state.handleAfterPrint);
        } catch {
            // El popup es siempre mismo-origen (nosotros escribimos su documento),
            // así que esto no debería fallar — defensivo nada más.
        }
        state.handleAfterPrint = null;
    }
    try {
        if (!state.popup.closed) state.popup.close();
    } catch {
        // Idem: defensivo.
    }

    if (activePrintWindow === state) activePrintWindow = null;
}

/**
 * `null` si el navegador bloqueó la ventana emergente (el caller decide cómo
 * avisar). `true` en cuanto el popup queda abierto y el cierre programado —
 * NO espera a que el usuario termine de imprimir.
 *
 * Lifecycle del popup (la causa raíz del bloqueo que esto corrige: nunca se
 * cerraba, así que el `about:blank` quedaba huérfano y, al compartir proceso
 * de renderizado con la app por ser mismo-origen, el siguiente `print()`
 * volvía a congelarla):
 *
 * 1. Si ya hay un popup de una impresión anterior sin cerrar (otra etiqueta,
 *    o un doble click sobre el mismo botón), se cierra primero — nunca se
 *    acumulan ventanas.
 * 2. `window.open` + `document.write` + `document.close`, igual que antes.
 * 3. En `onload`, ANTES de `print()`: se registra `afterprint` en el popup
 *    (`{ once: true }`, se dispara en cuanto el usuario imprime o cancela) y
 *    un `focus` en la ventana principal (también una sola vez) como
 *    respaldo, por si Chromium no disparara `afterprint` para un documento
 *    escrito con `document.write` — exactamente la inconsistencia que motivó
 *    este ajuste. Registrar el respaldo aquí, y no en el momento de abrir el
 *    popup, importa: si se registrara antes, cualquier cambio de foco
 *    mientras el popup todavía se está preparando cerraría la ventana antes
 *    de que el usuario llegara a ver el Print Preview.
 * 4. Cualquiera de los dos eventos llama al mismo `cleanupPrintWindow`, que
 *    cierra el popup y retira el listener que no haya disparado.
 * 5. Un error en cualquier paso antes de `print()` (incluida la carga de
 *    `jsbarcode`) también limpia el popup — nunca queda un `about:blank`
 *    vacío por una excepción.
 */
export async function printBarcodeLabel(input: PrintBarcodeLabelInput): Promise<boolean> {
    if (activePrintWindow) cleanupPrintWindow(activePrintWindow);

    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (!printWindow) return false;

    const state: PrintWindowState = {
        popup: printWindow,
        handleAfterPrint: null,
        handleOpenerFocus: null,
        done: false,
    };
    activePrintWindow = state;
    const cleanup = () => cleanupPrintWindow(state);

    try {
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
            try {
                state.handleAfterPrint = () => cleanup();
                printWindow.addEventListener('afterprint', state.handleAfterPrint, { once: true });

                // Respaldo: si el usuario vuelve a la ventana principal (imprimió,
                // canceló, o cerró el popup a mano) y `afterprint` no disparó.
                state.handleOpenerFocus = () => {
                    if (!printWindow.closed) cleanup();
                };
                window.addEventListener('focus', state.handleOpenerFocus, { once: true });

                printWindow.focus();
                printWindow.print();
            } catch {
                cleanup();
            }
        };
        return true;
    } catch {
        cleanup();
        return false;
    }
}
