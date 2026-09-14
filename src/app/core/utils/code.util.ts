/**
 * Utilidades de código de barras (plan §14).
 *
 * El código se trata SIEMPRE como string para lookup y escaneo — nunca como
 * número (perdería ceros a la izquierda de un EAN o de un código interno).
 */

/** Origen del código principal de un producto (plan §8.4, adaptado). */
export type CodeSource = 'manufacturer' | 'internal';

/** Simbología para renderizar el código (plan §14.3). */
export type BarcodeFormat = 'EAN8' | 'UPCA' | 'EAN13' | 'ITF14' | 'CODE128';

/** Normaliza un código para usarlo como ID de `barcodes/{code}` (plan §14). */
export function normalizeCode(code: string): string {
    return code.trim().toUpperCase();
}

/**
 * Formato de renderizado según la forma del código (plan §14.3): el largo de
 * un código numérico de fábrica indica su simbología estándar. Cualquier otra
 * forma —incluidos todos los códigos internos `MP…`— se trata como CODE 128,
 * que es la única simbología que Mi Pimpollito genera (nunca inventa EAN-13).
 */
export function detectBarcodeFormat(code: string): BarcodeFormat {
    const normalized = normalizeCode(code);
    if (/^\d{8}$/.test(normalized)) return 'EAN8';
    if (/^\d{12}$/.test(normalized)) return 'UPCA';
    if (/^\d{13}$/.test(normalized)) return 'EAN13';
    if (/^\d{14}$/.test(normalized)) return 'ITF14';
    return 'CODE128';
}

/** `MP` + secuencial de 6 dígitos (plan §14.2), p. ej. `MP000001`. */
export function formatInternalCode(prefix: string, seq: number): string {
    return `${prefix}${String(seq).padStart(6, '0')}`;
}

/** `BarcodeFormat` propio → identificador de formato que espera `jsbarcode`. */
export function toJsBarcodeFormat(format: BarcodeFormat): string {
    return format === 'UPCA' ? 'UPC' : format;
}

/**
 * Heurística para decidir si un término de búsqueda es un código (para
 * resolverlo por `barcodes/{code}`, una sola lectura) o un nombre (para la
 * búsqueda por prefijo sobre `nameLower`) — plan §12.2, §14.
 *
 * Un código nunca lleva espacios. Los que Mi Pimpollito conoce son o bien
 * puramente numéricos de 6 dígitos o más (EAN/UPC/ITF de fábrica y la
 * mayoría de los códigos propios de otros comercios), o bien empiezan con el
 * prefijo interno `MP` seguido de dígitos. Un nombre de producto de una sola
 * palabra ("Pelota") no calza ninguna de las dos formas y sigue el camino de
 * nombre, igual que el heurístico de `@` para correo en Usuarios.
 */
export function looksLikeCode(term: string): boolean {
    const value = term.trim();
    if (!value || /\s/.test(value)) return false;
    return /^\d{6,}$/.test(value) || /^mp\d+$/i.test(value);
}
