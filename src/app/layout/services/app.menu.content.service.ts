import { Injectable, signal } from '@angular/core';

/**
 * Contenido del menú lateral.
 *
 * FASE 0A: menú mínimo, sin el modelo de permisos heredado.
 *
 * `label` guarda una **clave del catálogo** (`assets/i18n/es.json`), no el
 * texto: la plantilla de `menu-item` la resuelve con el pipe `| translate`.
 * Es deliberado — el servicio heredado construía el modelo dentro de
 * `translate.get('app').subscribe(...)`, una dependencia asíncrona en el
 * arranque que dejaba el sidebar vacío (plan §3.3, hallazgo 6). Con el pipe no
 * hay orden de inicialización que respetar.
 *
 * En la FASE 2 esto pasa a `layout/menu/menu.config.ts` como menú declarativo
 * por rol, filtrado con un `computed()` sobre la señal de sesión (plan §11.1).
 */
@Injectable({
    providedIn: 'root',
})
export class AppMenuContentService {
    model = signal<any[]>([]);

    constructor() {
        this.populateMenuContent();
    }

    populateMenuContent(): void {
        this.model.set([
            {
                label: 'app.common.options',
                items: [
                    {
                        label: 'app.menu.home',
                        icon: 'fas fa-house',
                        routerLink: ['/'],
                    },
                ],
            },
        ]);
    }
}
