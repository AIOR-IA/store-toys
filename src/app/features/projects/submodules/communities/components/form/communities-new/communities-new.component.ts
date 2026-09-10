import { Component, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-communities-new',
  templateUrl: './communities-new.component.html',
  styleUrl: './communities-new.component.scss'
})
export class CommunityNewComponent {
    translate = inject(TranslateService);
    breadcrumbItems = signal<MenuItem[]>([]);

    constructor() {
        this.translate.get('app.community').subscribe((t) => {
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
            },
            {
                label: t.breadcrumbs.new,
            },
        ]);
    }
}

