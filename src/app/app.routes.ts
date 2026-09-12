import { Routes } from '@angular/router';
import { NotFoundComponent, UnauthorizedComponent } from '@shared/components';
import { AppLayoutComponent } from './layout/layout.component';

/**
 * FASE 0A: estructura mínima para navegar y compilar.
 *
 * Todavía NO hay guards: `authGuard`/`roleGuard` llegan en la FASE 1 y las
 * rutas definitivas de Usuarios, Productos, Ventas, Gift Cards y Reportes en
 * sus fases (ver docs/architecture/mi-pimpollito-plan.md §11.2).
 */
export const routes: Routes = [
    {
        path: 'auth',
        loadChildren: () => import('./features/authentication/auth.routes'),
    },
    {
        path: '',
        component: AppLayoutComponent,
        children: [
            {
                path: '',
                loadComponent: () =>
                    import('./features/home/home.component').then(
                        (m) => m.HomeComponent,
                    ),
            },
        ],
    },
    { path: 'unauthorized', component: UnauthorizedComponent },
    { path: '**', component: NotFoundComponent },
];
