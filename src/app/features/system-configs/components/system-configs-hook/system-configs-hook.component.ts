import { Component, inject, OnInit, signal } from '@angular/core';
import { BaseListComponent } from '@shared/components';
import { ISystemConfig } from '../../models';
import { IBaseStateService } from '@core/models';
import { SystemConfigStateService } from '../../services';
import { SystemConfigService } from '../../services/system-configs.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
    selector: 'app-system-configs-hook',
    templateUrl: './system-configs-hook.component.html',
    styleUrl: './system-configs-hook.component.scss',
})
export class SystemConfigHookComponent extends BaseListComponent<ISystemConfig> {
    override state: IBaseStateService<ISystemConfig> = inject(
        SystemConfigStateService
    );
    private systemConfigService: SystemConfigService =
        inject(SystemConfigService);
    private toastService = inject(ToastService);
    public secretkey = signal<string>('');
    public markdownContent = signal<string>('');
    copied = signal<boolean>(false);
    remainingTime = signal<string>('');

    override async loadBreadcrumb() {
        this.translate.get('app.menu.admin').subscribe((t) => {
            this.breadcrumbItems.set([
                {
                    label: t.title,
                    routerLink: '/admin',
                },
                {
                    label: t.systemConfig,
                    routerLink: '/admin/system-configs',
                },
            ]);
        });

        this.systemConfigService.configSecretKey().subscribe((data: any) => {
            this.secretkey.set(data.key);
        });

        this.systemConfigService.getMarkdown().then((markdown) => {
            this.markdownContent.set(markdown);
        });
    }

    copyToClipboard(value: string) {
        navigator.clipboard
            .writeText(value)
            .then(() => {
                this.toastService.success(
                    'Clave secreta copiada al portapapeles'
                );
                this.setDisabled();
            })
            .catch((err) =>
                this.toastService.error('Error al copiar la clave secreta')
            );
    }

    setDisabled() {
        this.copied.set(true);
        setTimeout(() => {
            this.copied.set(false);
        }, 30000);
        this.countdown(
            30000,
            (t) => this.remainingTime.set(t),
            () => this.copied.set(false)
        );
    }

    countdown(
        ms: number,
        onTick: (remainingTime: string) => void,
        onFinish: () => void
    ) {
        const tick = () => {
            if (ms <= 0) {
                onTick('00:00');
                onFinish();
                return;
            }

            const minutes = Math.floor(ms / 1000 / 60);
            const seconds = Math.floor((ms / 1000) % 60);
            const formttedTime = `${String(minutes).padStart(2, '0')}:${String(
                seconds
            ).padStart(2, '0')}`;

            onTick(formttedTime);
            ms -= 1000;

            setTimeout(tick, 1000);
        };

        tick(); // Inicia la recursión
    }

    override loadTabs(): void {}
}
