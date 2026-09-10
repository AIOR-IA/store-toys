import { Component, inject, signal } from '@angular/core';
import { BaseListComponent, FilterTabOption } from '@shared/components';
import { IWebMapService } from '../../models';
import { IBaseStateService } from '@core/models';
import { WebMapServiceStateService } from '../../services';

@Component({
    selector: 'app-web-map-service-list',
    templateUrl: './web-map-service-list.component.html',
    styleUrl: './web-map-service-list.component.scss'
})

export class WebMapServiceListComponent extends BaseListComponent<IWebMapService> {
    override state: IBaseStateService<IWebMapService> = inject(WebMapServiceStateService);
    tabs = signal([] as FilterTabOption<any>[]);

    override loadBreadcrumb(): void {
        this.translate.get('app.webMapService.breadcrumbs').subscribe((t) => {
            this.breadcrumbItems.set([
                {
                    label: t.main,
                    routerLink: '/admin',
                },
                {
                    label: t.list,
                    routerLink: '/admin/web-map-service',
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
