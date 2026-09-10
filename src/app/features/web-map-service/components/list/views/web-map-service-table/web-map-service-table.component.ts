import { Component, inject, OnInit } from '@angular/core';

import { Pagination } from '@core/types';
import { WebMapServiceStateService } from '../../../../services';

@Component({
  selector: 'app-web-map-service-table',
  templateUrl: './web-map-service-table.component.html',
  styleUrl: './web-map-service-table.component.scss'
})
export class WebMapServiceTableComponent implements OnInit {

  state = inject(WebMapServiceStateService);

  ngOnInit(): void {
    this.state.findPage({}).then();
  }

  async loadLazy(event: any) {
    const pagination: Pagination = this.state.parsePagination(event);
    this.state.findPage(pagination).then();
  }
}
