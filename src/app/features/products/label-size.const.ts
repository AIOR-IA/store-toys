/**
 * Tamaño de etiqueta por defecto (plan §14.2, prompt §7): 50×30 mm, papel
 * adhesivo A4/carta en una impresora normal — no hay impresora térmica.
 *
 * Aislado en su propia constante para poder cambiarlo sin tocar la lógica
 * de impresión (ni la del PDF de la hoja de etiquetas ni la de la etiqueta
 * individual): ambas leen de aquí.
 */
export const LABEL_SIZE_MM = { width: 50, height: 30 } as const;
