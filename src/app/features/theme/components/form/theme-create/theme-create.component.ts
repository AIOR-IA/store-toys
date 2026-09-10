import { Component, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-theme-create',
  templateUrl: './theme-create.component.html',
  styleUrl: './theme-create.component.scss'
})
export class ThemeCreateComponent {

  translate = inject(TranslateService);
  breadcrumbItems = signal<MenuItem[]>([]);

  constructor() {
      this.translate.get('app.theme').subscribe((t) => {
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
              routerLink: '/admin/theme',
          },
          {
              label: t.breadcrumbs.create,
          },
      ]);
  }

}
