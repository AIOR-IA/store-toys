import { Routes } from '@angular/router';
import { NotFoundComponent, UnauthorizedComponent } from '@shared/components';
import { AppLayoutComponent } from './layout/layout.component';
import { authGuard } from '@core/session';

/**
 * FASE 1: `authGuard` protege todo lo que cuelga del layout. Sigue sin
 * existir `roleGuard` (Fase 2) ni las rutas definitivas de Usuarios,
 * Productos, Ventas, Gift Cards y Reportes (ver plan §11.2).
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
        ],
    },
    { path: 'unauthorized', component: UnauthorizedComponent },
    { path: '**', component: NotFoundComponent },
];
