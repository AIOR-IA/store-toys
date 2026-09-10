import { Component, inject, OnInit } from '@angular/core';
import { Pagination } from '@core/types';
import { RoleStateService } from 'app/features/roles/services';

@Component({
    selector: 'app-role-table-view',
    templateUrl: './role-table-view.component.html',
    styleUrl: './role-table-view.component.scss',
})
export class RoleTableViewComponent implements OnInit {
    state = inject(RoleStateService);

    ngOnInit(): void {
        this.state.findPage({}).then();
    }

    async loadLazy(event: any) {
        const pagination: Pagination = this.state.parsePagination(event);
        pagination.order = 'desc';
        this.state.findPage(pagination);
    }
}
