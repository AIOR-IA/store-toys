import { Component, inject, OnInit } from '@angular/core';

import { Pagination } from '@core/types';
import { CommunityStateService } from '../../../../services';

@Component({
  selector: 'app-communities-table',
  templateUrl: './communities-table.component.html',
  styleUrl: './communities-table.component.scss'
})
export class CommunityTableComponent implements OnInit {
    state = inject(CommunityStateService);

    ngOnInit(): void {
        this.state.findPage({}).then();
    }

    async loadLazy(event: any) {
        const pagination: Pagination = this.state.parsePagination(event);
        this.state.findPage(pagination).then();
    }
}
