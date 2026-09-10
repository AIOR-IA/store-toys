import { Component, inject } from '@angular/core';
import { BaseItemReaderComponent } from '@shared/components';
import { ITheme } from '../../../models';
import { ThemeStateService } from '../../../services';

@Component({
  selector: 'app-theme-edit',
  templateUrl: './theme-edit.component.html',
  styleUrl: './theme-edit.component.scss'
})
export class ThemeEditComponent extends BaseItemReaderComponent<ITheme> {
  state = inject(ThemeStateService);

  loadBreadcrumb() {
    this.translate.get('app.webMapService').subscribe((t) => {
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
          label: t.breadcrumbs.edit,
        },
      ]);
    });
  }
}
