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
 * catálogo (CLAUDE.md, tabla de roles); `authGuard` ya basta.
 *
 * FASE 4: `/ventas` tampoco lleva `adminGuard` por la misma razón — admin y
 * vendedor comparten el POS. El historial de ventas restringe lo que cada
 * quien ve DENTRO del componente (plan §15.5, `sellerId` forzado para el
 * vendedor), no con un guard de ruta.
 *
 * FASE 6: `/giftcards` tampoco lleva `adminGuard` — admin y vendedor
 * comparten el mostrador de Gift Cards (CLAUDE.md, tabla de roles); lo que
 * cada rol puede hacer se decide dentro del componente y, sobre todo, en las
 * Functions/Rules (nunca solo escondiendo un botón).
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
                path: 'ventas',
                loadChildren: () => import('./features/sales/sales.routes'),
            },
            {
                path: 'productos',
                loadChildren: () => import('./features/products/products.routes'),
            },
            {
                path: 'giftcards',
                loadChildren: () => import('./features/gift-cards/gift-cards.routes'),
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
