import { Component } from '@angular/core';

/**
 * Inicio — PLACEHOLDER TEMPORAL DE LA FASE 0A.
 *
 * El `home` heredado era el dashboard institucional de SAHTOSO (misión, visión,
 * valores, pestañas de presupuesto) y se eliminó por completo.
 *
 * Esta pantalla existe solo para que el layout tenga una ruta hija y el
 * proyecto compile y navegue. SE REEMPLAZA en fases posteriores por el Inicio
 * real (accesos rápidos, alerta de stock bajo, cierre del día).
 */
@Component({
    selector: 'app-home',
    standalone: true,
    template: `
        <div class="card p-8">
            <h1 class="text-2xl font-semibold text-carbon">Mi Pimpollito</h1>
            <p class="mt-2 text-gray-500">
                Base limpia lista. Pantalla de inicio temporal de la Fase 0A.
            </p>
        </div>
    `,
})
export class HomeComponent {}
