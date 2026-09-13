/**
 * Normalización de texto para búsqueda por prefijo (plan §12.2).
 *
 * Espejo intencional de `functions/src/normalize.ts`: el servicio de datos la
 * usa al escribir (`searchName`, `emailLower`) y el buscador al leer. Si el
 * normalizado de escritura y el de lectura divergen, la búsqueda deja de
 * encontrar cosas sin dar ningún error — por eso no se duplica la lógica con
 * variaciones, solo con la misma función copiada al lado de Functions, que no
 * puede compartir módulo con el frontend.
 */
export function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/** "apellidos nombres" normalizado (plan §7.1, §8.2). Sirve para ordenar el
 * listado alfabéticamente — ya NO se usa para buscar (ver `buildSearchTokens`). */
export function buildSearchName(firstName: string, lastName: string): string {
    return normalize(`${lastName} ${firstName}`);
}

/**
 * Tokens de búsqueda: una palabra normalizada por cada palabra de
 * `firstName`/`lastName`, sin duplicados.
 *
 * `searchName` (un solo string "apellido nombre") solo permite buscar por
 * PREFIJO de ese string exacto — encuentra "santos" (empieza la cadena) pero
 * no "mario" (segunda palabra). Firestore no tiene búsqueda de texto
 * completo, pero SÍ una consulta barata para "contiene esta palabra exacta":
 * `array-contains-any` sobre un array de palabras del documento. Con eso,
 * buscar "mario", "santos", "mario santos" o "santos mario" encuentran el
 * mismo usuario — el orden y qué campo era cada palabra dejan de importar.
 *
 * Es exactamente la estrategia `searchTokens` que el plan (§12.2) reserva
 * para cuando el prefijo simple no basta: "busca por palabra completa en
 * cualquier posición", con el costo de un array por documento y sin
 * prefijos parciales (buscar "mar" no encuentra "Mario") — una limitación
 * aceptable para un admin que conoce el nombre completo del empleado, en
 * una colección de como mucho un puñado de usuarios (plan §8.1).
 */
export function buildSearchTokens(firstName: string, lastName: string): string[] {
    const words = `${firstName} ${lastName}`
        .split(/\s+/)
        .map(normalize)
        .filter(Boolean);
    return Array.from(new Set(words));
}
