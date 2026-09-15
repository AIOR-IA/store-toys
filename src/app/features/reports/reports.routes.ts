import { Routes } from '@angular/router';

/**
 * `/reportes` (Fase 7, plan §18.3, roadmap Fase 7 punto 8): módulo SOLO
 * ADMIN. `adminGuard` va en `app.routes.ts` (mismo patrón que `/usuarios`)
 * — esconder el menú no es seguridad (CLAUDE.md): las Rules de
 * `dailySummaries`/`sales`/`giftCard*` ya rechazan a un `user` igual,
 * guard o no guard.
 */
export default [
    {
        path: '',
        loadComponent: () =>
            import('./components/reports-dashboard/reports-dashboard.component').then(
                (m) => m.ReportsDashboardComponent,
            ),
    },
] satisfies Routes;
