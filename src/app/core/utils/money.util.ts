/**
 * Dinero: enteros en centavos en toda la base de datos (plan §17.1).
 *
 * `Math.round`, nunca `Math.floor` ni una multiplicación directa: en
 * JavaScript `10.55 * 100` da `1054.9999999999998`, y truncarlo perdería un
 * centavo en silencio. El usuario siempre escribe y lee bolivianos; solo la
 * base de datos ve centavos.
 */
export const toCents = (bs: number): number => Math.round(bs * 100);
export const fromCents = (cents: number): number => cents / 100;
