import { Routes } from '@angular/router';
import { NotFoundComponent, UnauthorizedComponent } from '@shared/components';
import { AppLayoutComponent } from './layout/layout.component';
import { adminGuard, authGuard } from '@core/session';

/**
 * FASE 2: `/usuarios` cuelga del layout como cualquier otra ruta privada,
 * pero además exige `adminGuard` — un `user` autenticado y activo entra al
 * layout (pasa `authGuard`) pero no a este módulo.
 *
 * FASE 3: `/productos` NO lleva `adminGuard` — admin y vendedor comparten el
 * catálogo (CLAUDE.md, tabla de roles); `authGuard` ya basta. Ventas y Gift
 * Cards todavía no existen (plan §11.2).
 */
export const routes: Routes = [
    {
        path: 'auth',
        loadChildren: () => import('./features/authentication/auth.routes'),
    },
    {
        path: '',
        component: AppLayoutComponent,
        canActivate: [authGuard],
        children: [
            {
                path: '',
                loadComponent: () =>
                    import('./features/home/home.component').then(
                        (m) => m.HomeComponent,
                    ),
            },
            {
                path: 'productos',
                loadChildren: () => import('./features/products/products.routes'),
            },
            {
                path: 'usuarios',
                canActivate: [adminGuard],
                loadChildren: () => import('./features/users/users.routes'),
            },
        ],
    },
    { path: 'unauthorized', component: UnauthorizedComponent },
    { path: '**', component: NotFoundComponent },
];
