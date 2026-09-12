import { inject, Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

/**
 * Notificaciones toast sobre PrimeNG.
 *
 * FASE 0A: recibe el mensaje ya escrito en español. Antes recibía una clave de
 * ngx-translate y resolvía el texto de forma asíncrona; esa librería se retiró
 * (docs/architecture/mi-pimpollito-plan.md §4.5).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
    toast = inject(MessageService);

    public success(message: string): void {
        this.toast.add({
            severity: 'success',
            summary: 'Correcto',
            detail: message,
        });
    }

    public error(message: string | string[]): void {
        this.toast.add({
            severity: 'error',
            summary: 'Error',
            detail: Array.isArray(message) ? message.join(', ') : message,
        });
    }

    public info(message: string): void {
        this.toast.add({
            severity: 'info',
            summary: 'Información',
            detail: message,
        });
    }

    public warn(message: string): void {
        this.toast.add({
            severity: 'warn',
            summary: 'Advertencia',
            detail: message,
        });
    }
}
