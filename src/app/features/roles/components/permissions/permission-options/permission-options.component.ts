import { Component, inject, input } from '@angular/core';
import { BaseItemOptionsComponent } from '@shared/components';
import { IBaseStateService } from '@core/models';
import { RolePermissionsService, RoleStateService } from '../../../services';
import { catchError } from 'rxjs';
import { DialogService } from 'primeng/dynamicdialog';
import { PermissionFormComponent } from '../permission-form/permission-form.component';
import { PermissionModel } from '../../../models/permission.model';
import { IRolePermission } from '../../../models';
import { RESOURCES } from '@shared/constants';

@Component({
    selector: 'app-permission-options',
    templateUrl: './permission-options.component.html',
    styleUrl: './permission-options.component.scss',
})
export class PermissionOptionsComponent extends BaseItemOptionsComponent<IRolePermission> {
    override state!: IBaseStateService<IRolePermission>;
    override service = inject(RolePermissionsService);
    permission = input.required<PermissionModel>();
    roleState = inject(RoleStateService);
    dialogService = inject(DialogService);

    override loadOptions(t: Record<string, string>): void {
        this.items.set([
            {
                label: t['options'],
                items: [
                    {
                        label: t['edit'],
                        icon: 'fas fa-pencil-alt',
                        command: () => {
                            this.roleState.ref = this.dialogService.open(PermissionFormComponent,
                                {
                                    header: `${t['edit']} ${t['permissions']}: ${this.permission().resource.name}`,
                                    styleClass: 'w-full md:w-1/2',
                                    draggable: true,
                                    data: {...this.permission(), mode: 'update'},
                                }
                            );
                        },
                        visible: this.sessionService.canUpdate(RESOURCES.ROLES),
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

    override delete() {
        const { resourceId, roleId } = this.permission();
        const { uuid } = this.roleState.current;

        this.confirmService.confirm({
            accept: () => {
                this.service.deleteRolePermission(roleId, resourceId)
                    .pipe(
                        catchError((error) => {
                            this.toast.error('app.common.messages.notDeleted');
                            return error;
                        }),
                    )
                    .subscribe(() => {
                        this.roleState.findItem(uuid).then();
                        this.toast.success('app.common.messages.deleted');
                    });
            },
        });
    }
}
