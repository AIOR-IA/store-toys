import { Routes } from '@angular/router';

/**
 * `/usuarios` (plan §11.2). El `adminGuard` que protege este árbol vive en
 * `app.routes.ts`, junto al resto de rutas — no aquí, para que quede visible
 * en un solo lugar qué ruta requiere qué guard.
 */
export default [
    {
        path: '',
        loadComponent: () =>
            import('./components/user-list/user-list.component').then(
                (m) => m.UserListComponent,
            ),
    },
] satisfies Routes;
