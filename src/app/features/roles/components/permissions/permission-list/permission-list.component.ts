import { Component, effect, inject, signal, WritableSignal } from '@angular/core';
import { BaseItemReaderComponent } from '@shared/components';
import { IRole } from '../../../models';
import { RoleStateService } from '../../../services';
import { DialogService } from 'primeng/dynamicdialog';
import { PermissionFormComponent } from '../permission-form/permission-form.component';
import { RoleModel } from '../../../models/role.model';

@Component({
    selector: 'app-permission-list',
    templateUrl: './permission-list.component.html',
    styleUrl: './permission-list.component.scss',
})
export class PermissionListComponent extends BaseItemReaderComponent<IRole> {
    state = inject(RoleStateService);
    dialogService = inject(DialogService);
    modalTitle!: string;
    currentRole: WritableSignal<RoleModel> = signal(new RoleModel({} as IRole));

    constructor() {
        super();
        effect(() => {
            this.setCurrentRole();
        }, { allowSignalWrites: true });
    }

    setCurrentRole() {
        if (!this.state.current) return;

        this.currentRole.set(new RoleModel(this.state.current));
    }

    loadBreadcrumb() {
        this.translate.get('app.roles').subscribe((t) => {
            this.modalTitle = t.permissions.new;
            this.breadcrumbItems.set([
                {
                    label: t.breadcrumbs.main,
                    routerLink: '/admin',
                },
                {
                    label: t.breadcrumbs.list,
                    routerLink: '/admin/roles',
                },
                {
                    label: t.breadcrumbs.permissions,
                },
            ]);
        });
    }

    onAssignPermission(event: Event) {
        this.state.ref = this.dialogService.open(PermissionFormComponent,
            { header: this.modalTitle, styleClass: 'w-full md:w-1/2', draggable: true }
        );
    }

}
