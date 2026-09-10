import { Component, inject, OnInit } from '@angular/core';
import { Pagination } from '@core/types';
import { ThemeStateService } from '../../../../services';

@Component({
    selector: 'app-theme-table',
    templateUrl: './theme-table.component.html',
    styleUrl: './theme-table.component.scss',
})
export class ThemeTableComponent implements OnInit {
    state = inject(ThemeStateService);

    ngOnInit(): void {
        this.state.findPage({}).then();
    }

    async loadLazy(event: any) {
        const pagination: Pagination = this.state.parsePagination(event);
        this.state.findPage(pagination).then();
    }
}
