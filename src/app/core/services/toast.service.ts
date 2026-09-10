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
