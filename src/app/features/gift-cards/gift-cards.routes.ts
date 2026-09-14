import { Routes } from '@angular/router';

/**
 * `/giftcards` (Fase 6, plan §16). Admin y vendedor comparten el módulo
 * (CLAUDE.md, tabla de roles) — el `authGuard` de `app.routes.ts` ya basta;
 * lo que cada rol puede hacer se decide DENTRO del componente y, sobre todo,
 * en las Functions/Rules (CLAUDE.md: "esconder el menú no es seguridad").
 */
export default [
    {
        path: '',
        loadComponent: () =>
            import('./components/gift-card-list/gift-card-list.component').then(
                (m) => m.GiftCardListComponent,
            ),
    },
] satisfies Routes;
