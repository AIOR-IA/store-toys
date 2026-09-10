import { Component, effect, inject, OnInit } from '@angular/core';
import { UrlParamsReader } from '@core/base';
import { Mixin } from 'ts-mixer';
import { UserStateService } from '../../services';
import { MenuItem } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
@Component({
    selector: 'app-user-detail',
    templateUrl: './user-detail.component.html',
    styleUrl: './user-detail.component.scss',
})
export class UserDetailComponent extends Mixin(UrlParamsReader) {
    stateUsers = inject(UserStateService);
    translate = inject(TranslateService);
    breadcrumbItems: MenuItem[] = [];

    constructor(
      public config: DynamicDialogConfig,
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
        this.breadcrumbItems = [
            {
                label: t.breadcrumbs.main,
                routerLink: '/admin',
            },
            {
                label: t.breadcrumbs.list,
                routerLink: '/admin/users',
            },
            {
                label: t.breadcrumbs.details,
            },
        ];
    }
}
