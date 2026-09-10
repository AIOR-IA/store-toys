import { Component, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';

@Component({
    selector: 'app-new-user-form',
    templateUrl: './user-form.component.html',
    styleUrl: './user-form.component.scss',
})
export class UserNewFormComponent {
    translate = inject(TranslateService);
    breadcrumbItems = signal<MenuItem[]>([]);

    constructor() {
        this.translate.get('app.users').subscribe((t) => {
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
                routerLink: '/admin/users',
            },
            {
                label: t.breadcrumbs.new,
            },
        ]);
    }
}
