import { CommonModule } from '@angular/common';
import { Component, inject, input, model } from '@angular/core';
import { Pagination } from '@core/types';
import { TranslateModule } from '@ngx-translate/core';
import { BaseListComponent } from '@shared/components/base/base-list.component';
import { IAudit } from 'app/features/audit/models';
import { AuditService, AuditStateService } from 'app/features/audit/services';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { ItemsNotFoundComponent } from '../items-not-found/items-not-found.component';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-audit-observations',
    standalone: true,
    imports: [
        DialogModule,
        CommonModule,
        TableModule,
        TranslateModule,
        ItemsNotFoundComponent,
        TooltipModule,
    ],
    providers: [AuditService, AuditStateService],
    templateUrl: './audit-observations.component.html',
    styleUrl: './audit-observations.component.scss',
})
export class AuditObservationsComponent extends BaseListComponent<IAudit> {
    override loadTabs(): void {
    }
    itemId = input.required<number>();
    itemModel = input.required<string>();
    itemName = input.required<string>();

    visible = model(false);

    override state = inject(AuditStateService);

    override loadBreadcrumb(): void {}

    async loadLazy(event: any) {
        const pagination: Pagination = this.state.parsePagination(event);
        pagination.filter = {
            itemId: this.itemId(),
            itemModel: this.itemModel(),
            observations: true,
        };

        this.state.findPage(pagination);
    }

    loadAuditObservations(event: any) {
        this.visible.set(true);
        this.state.findPage({
            perPage: 50,
            filter: {
                itemId: this.itemId(),
                itemModel: this.itemModel(),
                observations: true,
            },
        });
    }
}
