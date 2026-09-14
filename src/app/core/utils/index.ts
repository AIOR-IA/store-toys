export * from './common.util';
export * from './normalize.util';
export * from './money.util';
export * from './code.util';
// `date.util.ts` NO se re-exporta aquí a propósito: usa `dayjs` a nivel de
// módulo (con `.extend()` de plugins al cargar), y `dayjs` es CJS — no se
// puede garantizar libre de efectos secundarios para el tree-shaking. Si se
// re-exportara desde este barrel, cualquier chunk EAGER que importe algo de
// `@core/utils` (aunque no sea esto) arrastraría `dayjs` al bundle inicial,
// igual que `pdfmake`/`jsbarcode` en Productos. Solo lo usa Ventas (ya
// lazy): importar directo de `@core/utils/date.util`.
