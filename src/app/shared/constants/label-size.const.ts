/**
 * Tamaño de etiqueta por defecto: 50×30 mm, papel adhesivo A4/carta en una
 * impresora normal — no hay impresora térmica (plan §14.2, prompt Fase 6-bis
 * §14: "revisa el tamaño de Productos... comparte la constante si aplica").
 *
 * Movida aquí desde `features/products/label-size.const.ts` (Productos fue
 * quien la introdujo primero) para que Gift Cards reutilice la MISMA fuente
 * en vez de duplicar el valor: aislada en su propia constante para poder
 * cambiarla sin tocar ninguna lógica de impresión.
 */
export const LABEL_SIZE_MM = { width: 50, height: 30 } as const;
