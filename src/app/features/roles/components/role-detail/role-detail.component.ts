import { Component, inject } from '@angular/core';
import { RoleStateService } from '../../services';
import { BaseItemReaderComponent } from '@shared/components';
import { IRole } from '../../models';
import { SystemAccessPermissions } from '@core/types';

@Component({
    selector: 'app-role-detail',
    templateUrl: './role-detail.component.html',
    styleUrl: './role-detail.component.scss',
})
export class RoleDetailComponent extends BaseItemReaderComponent<IRole> {
    state = inject(RoleStateService);

    loadBreadcrumb() {
        this.translate.get('app.roles').subscribe((t) => {
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
                    label: t.breadcrumbs.details,
                },
            ]);
        });
    }

    protected readonly SystemAccessPermissions = SystemAccessPermissions;
}
