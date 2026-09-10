import { Component, effect, inject } from '@angular/core';
import { BaseItemReaderComponent } from '@shared/components';
import { IWebMapService } from '../../models';
import { WebMapServiceStateService } from '../../services';

@Component({
  selector: 'app-web-map-service-details',
  templateUrl: './web-map-service-details.component.html',
  styleUrl: './web-map-service-details.component.scss'
})
export class WebMapServiceDetailsComponent extends BaseItemReaderComponent<IWebMapService> {
    state = inject(WebMapServiceStateService);

    loadBreadcrumb() {
        this.translate.get('app.webMapService').subscribe((t) => {
            this.breadcrumbItems.set([
                {
                    label: t.breadcrumbs.main,
                    routerLink: '/admin',
                },
                {
                    label: t.breadcrumbs.list,
                    routerLink: '/admin/web-map-service',
                },
                {
                    label: t.breadcrumbs.details,
                },
            ]);
        });
    }
}
