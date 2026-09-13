import { Injectable, computed, inject } from '@angular/core';
import { SessionService } from '@core/session';
import { MENU } from '../menu/menu.config';

/**
 * Contenido del menú lateral, filtrado por rol (plan §11.1, Fase 2).
 *
 * `computed()` sobre la señal de sesión: se recalcula solo cuando la sesión
 * cambia (login, logout, o un `isActive`/`role` que cambia en caliente), sin
 * ningún contador manual (`refresSideBar`) ni dependencia de
 * `translate.get(...).subscribe(...)` — ese patrón heredado evaluaba los
 * permisos una sola vez, en el arranque, y dejaba el sidebar vacío si la
 * sesión todavía no había resuelto (plan §3.3, hallazgo 6).
 *
 * `label` sigue siendo una **clave** de `es.json`, no el texto: la plantilla
 * de `menu-item` la resuelve con el pipe `| translate`.
 */
@Injectable({
    providedIn: 'root',
})
export class AppMenuContentService {
    private readonly sessionService = inject(SessionService);

    readonly model = computed(() => {
        const session = this.sessionService.session();
        const role = session.status === 'active' ? session.role : null;

        const items = role
            ? MENU.filter((entry) => entry.roles.includes(role)).map(
                  (entry) => ({
                      label: entry.label,
                      icon: entry.icon,
                      routerLink: entry.routerLink,
                  }),
              )
            : [];

        return [
            {
                label: 'app.common.options',
                items,
            },
        ];
    });
}
