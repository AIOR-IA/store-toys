import { Component, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';

@Component({
    selector: 'app-role-new',
    templateUrl: './role-new.component.html',
    styleUrl: './role-new.component.scss',
})
export class RoleNewComponent {
    translate = inject(TranslateService);
    breadcrumbItems = signal<MenuItem[]>([]);

    constructor() {
        this.translate.get('app.roles').subscribe((t) => {
            this.loadBreadcrumb(t);
        });
    }

    loadBreadcrumb(t: any) {
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
                label: t.breadcrumbs.new,
            },
        ]);
    }
}
