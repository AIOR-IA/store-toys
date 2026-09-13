import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class ToastService {
    toast = inject(MessageService);
    t = inject(TranslateService);

    public success(key: string): void {
        this.t.get(key).subscribe((message) => {
            this.toast.add({
                severity: 'success',
                summary: 'Correcto',
                detail: message,
            });
        });
    }
    /**
     * Muestra un texto ya resuelto, sin pasar por `translate.get()`.
     *
     * Para mensajes que no son claves de `es.json` sino texto dinámico que ya
     * llega en español — por ejemplo, el `message` de un `HttpsError` que
     * nosotros mismos redactamos en una Cloud Function (`functions/src/users.ts`).
     * Mostrar ESE texto no es el "mensaje crudo de Firebase" que CLAUDE.md
     * prohíbe: es nuestro propio mensaje, ya localizado en el servidor.
     */
    public errorMessage(detail: string): void {
        this.toast.add({ severity: 'error', summary: 'Error', detail });
    }

    public error(key: string | string[]): void {
        this.t.get(key).subscribe((message) => {
            if (Array.isArray(message)) {
                this.toast.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: message.join(','),
                });
            } else {
                this.toast.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: message,
                });
            }
        });
    }
    public info(key: string): void {
        this.t.get(key).subscribe((message) => {
            this.toast.add({
                severity: 'info',
                summary: 'Información',
                detail: message,
            });
        });
    }
    public warn(key: string): void {
        this.t.get(key).subscribe((message) => {
            this.toast.add({
                severity: 'warn',
                summary: 'Advertencia',
                detail: message,
            });
        });
    }
}
