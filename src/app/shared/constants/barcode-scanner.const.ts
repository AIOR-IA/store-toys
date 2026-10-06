/**
 * Anti-rebote del lector HID (sufijo Enter). El MISMO código dentro de esta
 * ventana, contada desde su última lectura aceptada, es un rebote. Un código
 * DIFERENTE nunca se bloquea.
 */
export const SAME_BARCODE_DEBOUNCE_MS = 1100;
