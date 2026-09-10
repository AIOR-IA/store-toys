import { Component, inject } from '@angular/core';
import { BaseItemOptionsComponent } from '@shared/components';
import { IBaseStateService } from '@core/models';
import { IHttService } from '@core/models/http-service.interface';
import { RESOURCES } from '@shared/constants';
import { IWebMapService } from '../../../../models';
import { WebMapServiceService, WebMapServiceStateService } from '../../../../services';

@Component({
  selector: 'app-web-map-service-options',
  templateUrl: './web-map-service-options.component.html',
  styleUrl: './web-map-service-options.component.scss'
})
export class WebMapServiceOptionsComponent extends BaseItemOptionsComponent<IWebMapService> {

  override state: IBaseStateService<IWebMapService> = inject(WebMapServiceStateService);
  override service: IHttService<IWebMapService> = inject(WebMapServiceService);

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
              this.goTo(`/admin/web-map-service/${itemId}`);
            },
          },
          {
            label: t['edit'],
            icon: 'fas fa-pencil-alt',
            command: () => {
              const itemId = this.item().id;
              this.goTo(`/admin/web-map-service/${itemId}/edit`);
            },
            visible: this.sessionService.canUpdate(RESOURCES.WEB_MAP_SERVICE),
          },
          {
            label: t['delete'],
            icon: 'fas fa-trash-alt',
            command: () => {
              this.delete();
            },
            visible: this.sessionService.canDelete(RESOURCES.WEB_MAP_SERVICE),
          },
        ],
      },
    ]);
  }
}
