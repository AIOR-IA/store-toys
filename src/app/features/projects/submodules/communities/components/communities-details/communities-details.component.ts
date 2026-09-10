import { Component, effect, inject } from '@angular/core';
import { BaseItemReaderComponent } from '@shared/components';
import { ICommunity } from '../../models';
import { CommunityStateService } from '../../services';

@Component({
    selector: 'app-communities-details',
    templateUrl: './communities-details.component.html',
    styleUrl: './communities-details.component.scss',
})
export class CommunityDetailsComponent extends BaseItemReaderComponent<ICommunity> {
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
                    label: t.breadcrumbs.details,
                },
            ]);
        });
    }
}
