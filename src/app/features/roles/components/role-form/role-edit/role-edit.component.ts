import { Component, effect, inject, signal } from '@angular/core';
import { UrlParamsReader } from '@core/base';
import { TranslateService } from '@ngx-translate/core';
import { BaseItemReaderComponent } from '@shared/components';
import { IRole } from 'app/features/roles/models';
import { RoleStateService } from 'app/features/roles/services';
import { MenuItem } from 'primeng/api';
import { Mixin } from 'ts-mixer';

@Component({
    selector: 'app-role-edit',
    templateUrl: './role-edit.component.html',
    styleUrl: './role-edit.component.scss',
})
export class RoleEditComponent extends BaseItemReaderComponent<IRole> {
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
                    label: t.breadcrumbs.edit,
                },
            ]);
        });
    }
}
