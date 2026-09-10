import { Component, inject, signal } from '@angular/core';
import { BaseListComponent, FilterTabOption } from '@shared/components';
import { IProject } from '../../models';
import { IBaseStateService } from '@core/models';
import { ProjectStateService } from '../../services';

@Component({
    selector: 'app-projects-list',
    templateUrl: './projects-list.component.html',
    styleUrl: './projects-list.component.scss'
})
export class ProjectListComponent extends BaseListComponent<IProject> {
    override state: IBaseStateService<IProject> = inject(ProjectStateService);
    tabs = signal([] as FilterTabOption<any>[]);

    override loadBreadcrumb(): void {
        this.translate.get('app.project.breadcrumbs').subscribe((t) => {
            this.breadcrumbItems.set([
                {
                    label: t.main,
                    routerLink: '/admin',
                },
                {
                    label: t.list,
                    routerLink: '/admin/projects',
                },
            ]);
        });
    }

    override loadTabs() {
            const _tabs: FilterTabOption<any>[] = [
            ];
    
            this.tabs.set(_tabs);
    }

    onChangeTab(event: any) {
        this.state.findPage({});
    }

    onReload(event: any) {
        this.state.reload();
    }
}
