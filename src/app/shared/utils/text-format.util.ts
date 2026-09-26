/**
 * Estándar VISUAL de textos de producto (una sola fuente de verdad).
 *
 * - Nombre → MAYÚSCULAS.
 * - Descripción → «sentence case» (primera letra de cada oración en mayúscula,
 *   el resto en minúscula). NO es TitleCase: en español sería «Muñeca Con
 *   Accesorios Para Niñas».
 *
 * Son funciones puras que solo se usan AL MOSTRAR (plantillas, PDFs, etiquetas
 * impresas, mensajes). Nunca se aplican antes de guardar, ni a snapshots
 * históricos, ni a claves de agrupación/búsqueda (`nameLower`, `productId`…):
 * el dato almacenado no cambia. Los pipes `productName`/`productDescription`
 * (`@shared/pipes`) delegan aquí, y los generadores de PDF llaman a estas
 * mismas funciones — no hay una segunda regla.
 */

const LOCALE = 'es';

/** `null`/`undefined`/vacío → `''`. */
export function formatProductName(value: string | null | undefined): string {
    if (!value) return '';
    return value.trim().toLocaleUpperCase(LOCALE);
}

/**
 * `null`/`undefined`/vacío → `''`. Minúscula todo y sube la primera letra del
 * texto y de cada oración (tras `.`, `!`, `?` seguido de espacio). Conserva
 * á é í ó ú ñ ü. No toca los espacios internos.
 */
export function formatProductDescription(value: string | null | undefined): string {
    if (!value) return '';
    const lower = value.trim().toLocaleLowerCase(LOCALE);
    return lower.replace(/(^[¿¡]?|[.!?]\s+[¿¡]?)(\p{L})/gu, (_match, lead: string, letter: string) =>
        lead + letter.toLocaleUpperCase(LOCALE),
    );
}
