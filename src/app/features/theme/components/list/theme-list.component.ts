import { Component, inject, signal } from '@angular/core';
import { BaseListComponent, FilterTabOption } from '@shared/components';
import { ITheme } from '../../models';
import { IBaseStateService } from '@core/models';
import { ThemeStateService } from '../../services';

@Component({
  selector: 'app-theme-list',
  templateUrl: './theme-list.component.html',
  styleUrl: './theme-list.component.scss'
})
export class ThemeListComponent extends BaseListComponent<ITheme> {

  override state: IBaseStateService<ITheme> = inject(ThemeStateService);
  tabs = signal([] as FilterTabOption<any>[]);

  override loadBreadcrumb(): void {
    this.translate.get('app.theme.breadcrumbs').subscribe((t) => {
      this.breadcrumbItems.set([
        {
          label: t.main,
          routerLink: '/admin',
        },
        {
          label: t.list,
          routerLink: '/admin/theme',
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
