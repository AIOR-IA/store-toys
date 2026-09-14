import { RoleUser } from '@core/session';

export interface MenuEntry {
    label: string;
    icon: string;
    routerLink: string[];
    roles: RoleUser[];
}

/**
 * Menú declarativo por rol (plan §11.1).
 *
 * Cada entrada declara los roles que la ven; el sidebar la filtra con un
 * `computed()` sobre la señal de sesión — se recalcula solo cuando la sesión
 * cambia, sin el `AppMenuContentService` heredado que construía el modelo
 * dentro de `translate.get('app').subscribe(...)` (una dependencia asíncrona
 * que dejaba el sidebar vacío en el arranque).
 *
 * Solo lleva las rutas que **ya existen**. Gift Cards aparece aquí cuando su
 * fase construya la pantalla real — antes sería un enlace que cae en el "no
 * encontrado" (plan §11.1).
 */
export const MENU: MenuEntry[] = [
    {
        label: 'app.menu.home',
        icon: 'fas fa-house',
        routerLink: ['/'],
        roles: ['admin', 'user'],
    },
    {
        label: 'app.menu.sales',
        icon: 'fas fa-cash-register',
        routerLink: ['/ventas'],
        roles: ['admin', 'user'],
    },
    {
        label: 'app.menu.products',
        icon: 'fas fa-cubes',
        routerLink: ['/productos'],
        roles: ['admin', 'user'],
    },
    {
        label: 'app.menu.users',
        icon: 'fas fa-users',
        routerLink: ['/usuarios'],
        roles: ['admin'],
    },
];
