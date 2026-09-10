import { Component, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-projects-new',
  templateUrl: './projects-new.component.html',
  styleUrl: './projects-new.component.scss'
})
export class ProjectNewComponent {
    translate = inject(TranslateService);
    breadcrumbItems = signal<MenuItem[]>([]);

    constructor() {
        this.translate.get('app.project').subscribe((t) => {
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
                routerLink: '/admin/projects',
            },
            {
                label: t.breadcrumbs.new,
            },
        ]);
    }
}

