import { Component, inject } from '@angular/core';
import { IBaseStateService } from '@core/models';
import { IHttService } from '@core/models/http-service.interface';
import { BaseItemOptionsComponent } from '@shared/components/base/base-item-options.component';
import { IRole } from 'app/features/roles/models';
import { RolesService, RoleStateService } from 'app/features/roles/services';
import { RESOURCES } from '@shared/constants';

@Component({
    selector: 'app-role-options',
    templateUrl: './role-options.component.html',
    styleUrl: './role-options.component.scss',
})
export class RoleOptionsComponent extends BaseItemOptionsComponent<IRole> {
    override state: IBaseStateService<IRole> = inject(RoleStateService);
    override service: IHttService<IRole> = inject(RolesService);

    override loadOptions(t: Record<string, string>): void {
        this.items.set([
            {
                label: t['options'],
                items: [
                    {
                        label: t['details'],
                        icon: 'fas fa-eye',
                        command: () => {
                            const itemId = this.item().uuid;
                            this.goTo(`/admin/roles/${itemId}`);
                        },
                    },
                    {
                        label: t['edit'],
                        icon: 'fas fa-pencil-alt',
                        command: () => {
                            const itemId = this.item().uuid;
                            this.goTo(`/admin/roles/${itemId}/edit`);
                        },
                        visible: this.sessionService.canUpdate(RESOURCES.ROLES),
                    },
                    {
                        label: t['permissions'],
                        icon: 'fas fa-key',
                        command: () => {
                            const itemId = this.item().uuid;
                            this.goTo(`/admin/roles/${itemId}/permissions`);
                        },
                        visible: this.sessionService.canManage(RESOURCES.ROLES),
                    },
                    {
                        label: t['delete'],
                        icon: 'fas fa-trash-alt',
                        command: () => {
                            this.delete();
                        },
                        visible: this.sessionService.canDelete(RESOURCES.ROLES),
                    },
                ],
            },
        ]);
    }
}
