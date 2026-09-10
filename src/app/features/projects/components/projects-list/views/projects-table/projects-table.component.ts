import { Component, inject, OnInit } from '@angular/core';

import { Pagination } from '@core/types';
import { ProjectStateService } from '../../../../services';

@Component({
  selector: 'app-projects-table',
  templateUrl: './projects-table.component.html',
  styleUrl: './projects-table.component.scss'
})
export class ProjectTableComponent implements OnInit {
    state = inject(ProjectStateService);

    ngOnInit(): void {
        this.state.findPage({}).then();
    }

    async loadLazy(event: any) {
        const pagination: Pagination = this.state.parsePagination(event);
        this.state.findPage(pagination).then();
    }
}
