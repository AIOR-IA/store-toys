import { Component, inject, signal } from '@angular/core';
import { BaseListComponent, FilterTabOption } from '@shared/components';
import { ICommunity } from '../../models';
import { IBaseStateService } from '@core/models';
import { CommunityStateService } from '../../services';
import { IProject } from 'app/features/projects/models';
import { ProjectService } from 'app/features/projects/services';
import { Mixin } from 'ts-mixer';
import { UrlParamsReader } from '@core/base';

@Component({
    selector: 'app-communities-list',
    templateUrl: './communities-list.component.html',
    styleUrl: './communities-list.component.scss'
})
export class CommunityListComponent extends Mixin(UrlParamsReader, BaseListComponent<ICommunity>) {
    override state: IBaseStateService<ICommunity> = inject(CommunityStateService);
    tabs = signal([] as FilterTabOption<any>[]);

    projectService = inject(ProjectService);
    current = signal<IProject>({} as IProject);

    override ngOnInit(): void {
        this.loadBreadcrumb();
        this.loadCurrentRegulation();
    }

    override loadBreadcrumb(): void {
        this.translate.get('app.community.breadcrumbs').subscribe((t) => {
            this.breadcrumbItems.set([
                {
                    label: t.main,
                    routerLink: '/admin',
                },
                {
                    label: t.project,
                    routerLink: '/admin/projects',
                },
                {
                    label: t.list,
                    routerLink: '/admin/communities',
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

    loadCurrentRegulation() {
        const uuid = this.params().uuid;
        this.projectService.findByUuid(uuid).subscribe({
            next: (response) => {
                this.current.set(response);
                this.loadCommunities();
            },
            error: (err) => { },
        });
    }

    loadCommunities() {
        const projectId = this.current().id;
        const filter = { projectId };
        this.state.findPage({ filter });
    }


    get backPath(): string {
        return `/admin/projects`;
    }
}
