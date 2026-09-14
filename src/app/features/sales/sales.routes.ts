import { Routes } from '@angular/router';

/**
 * `/ventas` (plan §11.2). Ambos roles entran — admin y vendedor comparten el
 * POS y el historial (CLAUDE.md, tabla de roles); el historial mismo filtra
 * por rol dentro del componente (plan §15.5), no con un guard de ruta.
 */
export default [
    {
        path: '',
        loadComponent: () =>
            import('./components/sales-pos/sales-pos.component').then(
                (m) => m.SalesPosComponent,
            ),
    },
    {
        path: 'historial',
        loadComponent: () =>
            import('./components/sales-history/sales-history.component').then(
                (m) => m.SalesHistoryComponent,
            ),
    },
] satisfies Routes;
