import { Component, effect, inject } from '@angular/core';
import { BaseItemReaderComponent } from '@shared/components';
import { ITheme } from '../../models';
import { ThemeStateService } from '../../services';

@Component({
  selector: 'app-theme-details',
  templateUrl: './theme-details.component.html',
  styleUrl: './theme-details.component.scss'
})
export class ThemeDetailsComponent extends BaseItemReaderComponent<ITheme> {
    state = inject(ThemeStateService);

    loadBreadcrumb() {
        this.translate.get('app.theme').subscribe((t) => {
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
                    label: t.breadcrumbs.details,
                },
            ]);
        });
    }
}