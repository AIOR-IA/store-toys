import { Component, inject } from '@angular/core';
import { BaseItemOptionsComponent } from '@shared/components';
import { IBaseStateService } from '@core/models';
import { IHttService } from '@core/models/http-service.interface';
import { RESOURCES } from '@shared/constants';
import { ITheme } from '../../../../models';
import { ThemeService, ThemeStateService } from '../../../../services';

@Component({
  selector: 'app-theme-options',
  templateUrl: './theme-options.component.html',
  styleUrl: './theme-options.component.scss'
})
export class ThemeOptionsComponent extends BaseItemOptionsComponent<ITheme> {

  override state: IBaseStateService<ITheme> = inject(ThemeStateService);
  override service: IHttService<ITheme> = inject(ThemeService);

  override loadOptions(t: Record<string, string>): void {
    this.items.set([
      {
        label: t['options'],
        items: [
          {
            label: t['details'],
            icon: 'fas fa-eye',
            command: () => {
              const itemId = this.item().id;
              this.goTo(`/admin/theme/${itemId}`);
            },
          },
          {
            label: t['edit'],
            icon: 'fas fa-pencil-alt',
            command: () => {
              const itemId = this.item().id;
              this.goTo(`/admin/theme/${itemId}/edit`);
            },
            visible: this.sessionService.canUpdate(RESOURCES.GEOGRAPHIC_LAYER),
          },
          {
            label: t['delete'],
            icon: 'fas fa-trash-alt',
            command: () => {
              this.delete();
            },
            visible: this.sessionService.canDelete(RESOURCES.GEOGRAPHIC_LAYER),
          },
        ],
      },
    ]);
  }
}

