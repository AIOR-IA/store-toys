import { Component, inject } from '@angular/core';
import { BaseItemOptionsComponent } from '@shared/components';
import { IBaseStateService } from '@core/models';
import { IHttService } from '@core/models/http-service.interface';
import { RESOURCES } from '@shared/constants';
import { ICommunity } from '../../../../models';
import { CommunityService, CommunityStateService } from '../../../../services';

@Component({
  selector: 'app-communities-options',
  templateUrl: './communities-options.component.html',
  styleUrl: './communities-options.component.scss'
})
export class CommunityOptionsComponent extends BaseItemOptionsComponent<ICommunity> {
    override state: IBaseStateService<ICommunity> = inject(CommunityStateService);
    override service: IHttService<ICommunity> = inject(CommunityService);

    override loadOptions(t: Record<string, string>): void {
        this.items.set([
            {
                label: t['options'],
                items: [
                    {
                        label: t['details'],
                        icon: 'fas fa-eye',
                        command: () => {
                            const itemId = this.item().uuid;
                            const id = this.item().id;
                            this.goTo(`/admin/projects/communities/${itemId}/${id}/details`);
                        },
                    },
                    {
                        label: t['edit'],
                        icon: 'fas fa-pencil-alt',
                        command: () => {
                            const itemId = this.item().uuid;
                            const id = this.item().id;
                            this.goTo(`/admin/projects/communities/${itemId}/${id}/edit`);
                        },
                        visible: this.sessionService.canUpdate(RESOURCES.PROJECT),
                    },
                    {
                        label: t['delete'],
                        icon: 'fas fa-trash-alt',
                        command: () => {
                            this.delete();
                        },
                        visible: this.sessionService.canDelete(RESOURCES.PROJECT),
                    },
                ],
            },
        ]);
    }
}
