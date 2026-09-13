import { Routes } from '@angular/router';
import { NotFoundComponent, UnauthorizedComponent } from '@shared/components';
import { AppLayoutComponent } from './layout/layout.component';
import { adminGuard, authGuard } from '@core/session';

/**
 * FASE 2: `/usuarios` cuelga del layout como cualquier otra ruta privada,
 * pero además exige `adminGuard` — un `user` autenticado y activo entra al
 * layout (pasa `authGuard`) pero no a este módulo. Todavía no existen las
 * rutas definitivas de Productos, Ventas, Gift Cards y Reportes (plan §11.2).
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
                path: 'usuarios',
                canActivate: [adminGuard],
                loadChildren: () => import('./features/users/users.routes'),
            },
        ],
    },
    { path: 'unauthorized', component: UnauthorizedComponent },
    { path: '**', component: NotFoundComponent },
];
