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
 * Solo lleva las rutas que **ya existen**. Ventas, Productos, Gift Cards y
 * Reportes aparecen aquí cuando sus fases construyan la pantalla real — antes
 * sería un enlace que cae en el "no encontrado" (plan §11.1, Fase 2: "no
 * implementar todavía las pantallas de módulos futuros").
 */
export const MENU: MenuEntry[] = [
    {
        label: 'app.menu.home',
        icon: 'fas fa-house',
        routerLink: ['/'],
        roles: ['admin', 'user'],
    },
    {
        label: 'app.menu.users',
        icon: 'fas fa-users',
        routerLink: ['/usuarios'],
        roles: ['admin'],
    },
];
