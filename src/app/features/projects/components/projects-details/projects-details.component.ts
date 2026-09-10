import { Component, effect, inject } from '@angular/core';
import { BaseItemReaderComponent } from '@shared/components';
import { IProject } from '../../models';
import { ProjectStateService } from '../../services';

@Component({
    selector: 'app-projects-details',
    templateUrl: './projects-details.component.html',
    styleUrl: './projects-details.component.scss',
})
export class ProjectDetailsComponent extends BaseItemReaderComponent<IProject> {
    state = inject(ProjectStateService);

    loadBreadcrumb() {
        this.translate.get('app.project').subscribe((t) => {
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
                    label: t.breadcrumbs.details,
                },
            ]);
        });
    }
}
