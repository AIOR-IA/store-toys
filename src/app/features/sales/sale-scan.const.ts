/**
 * Anti-rebote del lector HID en el POS.
 *
 * El lector es sensible y a veces UNA sola exposición física produce varias
 * lecturas del MISMO código casi instantáneas. Una lectura del mismo código
 * dentro de esta ventana, contada desde la última lectura ACEPTADA de ese
 * código, se ignora en silencio (sin lookup, sin toast, sin incremento).
 *
 * Debe ser CORTA a propósito: muchas unidades físicas comparten el mismo
 * código de barras (p. ej. 40 PUDIN con el mismo EAN), y el vendedor las pasa
 * una tras otra para llegar a cantidad 4. Un código DIFERENTE nunca se
 * bloquea, sin importar cuán rápido llegue.
 *
 * Valor INICIAL, pendiente de probar con el lector físico: ajustar solo esta
 * constante (250 / 350 / 500 ms) sin tocar la lógica.
 */
export const SAME_BARCODE_DEBOUNCE_MS = 1000;
