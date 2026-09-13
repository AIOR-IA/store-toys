/**
 * Normalización de texto para búsqueda por prefijo (plan §12.2).
 *
 * Espejo intencional de `src/app/core/utils/normalize.util.ts` del frontend:
 * las dos implementaciones tienen que producir exactamente el mismo
 * resultado, porque el frontend busca con el mismo criterio con el que esta
 * Function escribe. Si divergen, la búsqueda deja de encontrar cosas sin dar
 * ningún error.
 */
export function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/** "apellidos nombres" normalizado (plan §7.1). Solo para ordenar el listado. */
export function buildSearchName(firstName: string, lastName: string): string {
    return normalize(`${lastName} ${firstName}`);
}

/**
 * Tokens de búsqueda por palabra completa (plan §12.2, `searchTokens`).
 * Espejo exacto de `buildSearchTokens` en `core/utils/normalize.util.ts` del
 * frontend — createUser los escribe aquí, el buscador los consulta desde el
 * cliente con `array-contains-any`.
 */
export function buildSearchTokens(firstName: string, lastName: string): string[] {
    const words = `${firstName} ${lastName}`
        .split(/\s+/)
        .map(normalize)
        .filter(Boolean);
    return Array.from(new Set(words));
}
