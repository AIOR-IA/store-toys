import { Component, inject } from '@angular/core';
import { BaseItemReaderComponent } from '@shared/components';
import { IWebMapService } from '../../../models';
import { WebMapServiceStateService } from '../../../services';

@Component({
  selector: 'app-web-map-service-edit',
  templateUrl: './web-map-service-edit.component.html',
  styleUrl: './web-map-service-edit.component.scss'
})
export class WebMapServiceEditComponent extends BaseItemReaderComponent<IWebMapService> {
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
          label: t.breadcrumbs.edit,
        },
      ]);
    });
  }
}
