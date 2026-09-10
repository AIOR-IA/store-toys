import { Component, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-web-map-service-create',
  templateUrl: './web-map-service-create.component.html',
  styleUrl: './web-map-service-create.component.scss'
})
export class WebMapServiceCreateComponent {

  translate = inject(TranslateService);
  breadcrumbItems = signal<MenuItem[]>([]);

  constructor() {
      this.translate.get('app.webMapService').subscribe((t) => {
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
              routerLink: '/admin/web-map-service',
          },
          {
              label: t.breadcrumbs.create,
          },
      ]);
  }
}
