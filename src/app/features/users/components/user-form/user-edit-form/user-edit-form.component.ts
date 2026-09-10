import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { UrlParamsReader } from '@core/base';
import { TranslateService } from '@ngx-translate/core';
import { UserStateService } from 'app/features/users/services';
import { MenuItem } from 'primeng/api';
import { Mixin } from 'ts-mixer';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';

@Component({
    selector: 'app-user-edit-form',
    templateUrl: './user-edit-form.component.html',
    styleUrl: './user-edit-form.component.scss',
})
export class UserEditFormComponent extends Mixin(UrlParamsReader) {
    stateUsers = inject(UserStateService);
    translate = inject(TranslateService);
    breadcrumbItems = signal<MenuItem[]>([]);



    constructor(
      public config: DynamicDialogConfig
    ) {
        super();
        this.translate.get('app.users').subscribe((t) => {
            this.loadBreadcrumb(t);
        });
        effect(
            () => {
                this.findUser(this.config.data?.itemId);
            },
            { allowSignalWrites: true },
        );
    }

    findUser(uuid?: string): void {
        if (!uuid) return;
        this.stateUsers.findItem(uuid);
    }

    loadBreadcrumb(t: any) {
        this.breadcrumbItems.set([
            {
                label: t.breadcrumbs.main,
                routerLink: '/admin',
            },
            {
                label: t.breadcrumbs.list,
                routerLink: '/admin/users',
            },
            {
                label: t.breadcrumbs.edit,
            },
        ]);
    }
}
