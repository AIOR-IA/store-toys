import { Component, inject } from '@angular/core';
import { BaseItemReaderComponent } from '@shared/components';
import { ICommunity } from '../../../models';
import { CommunityStateService } from '../../../services';

@Component({
  selector: 'app-communities-edit',
  templateUrl: './communities-edit.component.html',
  styleUrl: './communities-edit.component.scss'
})
export class CommunityEditComponent extends BaseItemReaderComponent<ICommunity> {
    state = inject(CommunityStateService);

    loadBreadcrumb() {
        this.translate.get('app.community').subscribe((t) => {
            this.breadcrumbItems.set([
                {
                    label: t.breadcrumbs.main,
                    routerLink: '/admin',
                },
                {
                    label: t.breadcrumbs.list,
                },
                {
                    label: t.breadcrumbs.edit,
                },
            ]);
        });
    }
}
