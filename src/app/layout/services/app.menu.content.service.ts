import { Injectable, signal } from '@angular/core';

/**
 * Contenido del menú lateral.
 *
 * FASE 0A: menú mínimo y estático, sin traducción asíncrona y sin el modelo de
 * permisos heredado. En la FASE 2 se reemplaza por el menú declarativo por rol
 * descrito en docs/architecture/mi-pimpollito-plan.md §11.1, filtrado con un
 * `computed()` sobre la señal de sesión.
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
                label: 'Menú',
                items: [
                    {
                        label: 'Inicio',
                        icon: 'fas fa-house',
                        routerLink: ['/'],
                    },
                ],
            },
        ]);
    }
}
