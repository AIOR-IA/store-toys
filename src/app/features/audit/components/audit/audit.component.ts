import { Component, inject, signal } from '@angular/core';
import { AuditService, AuditStateService } from '../../services';
import { BaseListComponent } from '@shared/components';
import { AuditAction, IAudit } from '../../models';
import { Pagination } from '@core/types';
import { isObjectEmpty, objectEntries, objectKeys } from '@core/utils';

@Component({
    selector: 'app-audit',
    templateUrl: './audit.component.html',
    styleUrl: './audit.component.scss',
})
export class AuditComponent extends BaseListComponent<IAudit> {
    override state = inject(AuditStateService);

    isObjectEmpty = isObjectEmpty;
    objectEntries = objectEntries;
    objectKeys = objectKeys;
    actions = objectKeys(AuditAction);
    dates: Date[] | undefined;
    ipAddress: string | null = null;
    minDate = signal<Date | null>(null);
    maxDate = signal<Date | null>(null);

    auditService = inject(AuditService);

    override ngOnInit(): void {
        super.ngOnInit();
        this.state.findPage({ sort: 'createdAt', order: 'desc' });
    }
    override loadBreadcrumb(): void {
        this.translate.get('app.menu.admin').subscribe((tAdmin) => {
            this.breadcrumbItems.set([
                {
                    label: tAdmin.title,
                    routerLink: '/admin',
                },
                {
                    label: tAdmin.audit,
                    routerLink: '/admin/audit',
                },
            ]);
        });
    }

    override loadTabs(): void {}

    async loadLazy(event: any) {
        const pagination: Pagination = this.state.parsePagination(event);
        pagination.order = 'desc';
        pagination.sort = 'createdAt'
        this.state.findPage(pagination);
    }

    getKeyTranslatedAction(action: AuditAction): string {
        return `app.audit.actions.${action.toLocaleLowerCase()}`;
    }

    override onSearch(ip: string) {
        this.ipAddress = ip.trim() || null;
        this.executeSearch(this.getRangeDate());
    }

    public onChangeDates() {
        this.executeSearch(this.getRangeDate());
         if(this.maxDate()) {
            this.maxDate.set(null);
            this.minDate.set(null);
        }
    }

    private generateFilters(rangeDate?: { start: string; end: string }): any {
        const filter: any = {};

        if (rangeDate) {
            filter.rangeDate = rangeDate;
        }

        if (this.ipAddress) {
            filter.ipAddress = this.ipAddress;
        }

        return Object.keys(filter).length
            ? { filter: JSON.stringify(filter), page: 1}
            : {};
    }

    private executeSearch(rangeDate?: { start: string; end: string }) {
        if( this.minDate() && this.maxDate()) {
            this.state.findPage((this.generateFilters(rangeDate))).then();
        }
    }

    private getRangeDate(): { start: string; end: string } | undefined {
        if (this.dates && this.dates.length === 2) {
            const [start, end] = this.dates;
            this.minDate.set(start);
            this.maxDate.set(end);
            return {
                start:
                    new Date(start).toISOString(),
                end: new Date(end).toISOString()
            };
        }
        return undefined;
    }

    public downloadXlsx() {
        let filters: any = {
            page: 1,
            perPage: 500,
        };

        const filter: any = {};

        if (this.ipAddress && this.ipAddress.trim() !== '') {
            filter.ipAddress = this.ipAddress;
        }

        const rangeDate = this.getRangeDate();
        if (rangeDate) {
            filter.rangeDate = rangeDate;
        }

        if (Object.keys(filter).length > 0) {
            filters.filter = JSON.stringify(filter);
        }

        this.auditService.exportXlsx(filters).subscribe((response) => {
            const blob = new Blob([response], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'abd';
            a.click();

            window.URL.revokeObjectURL(url);
        });
    }
}
