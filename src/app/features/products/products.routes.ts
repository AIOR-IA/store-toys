import { Routes } from '@angular/router';

/**
 * `/productos` (plan §11.2). Ambos roles entran — el `authGuard` de
 * `app.routes.ts` ya basta; a diferencia de `/usuarios` no hace falta
 * `adminGuard` porque admin y vendedor comparten el catálogo (CLAUDE.md,
 * tabla de roles).
 */
export default [
    {
        path: '',
        loadComponent: () =>
            import('./components/product-list/product-list.component').then(
                (m) => m.ProductListComponent,
            ),
    },
    {
        path: 'etiquetas',
        loadComponent: () =>
            import(
                './components/product-labels-sheet/product-labels-sheet.component'
            ).then((m) => m.ProductLabelsSheetComponent),
    },
] satisfies Routes;
