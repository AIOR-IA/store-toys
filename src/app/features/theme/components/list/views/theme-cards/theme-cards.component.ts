import { Component, inject, OnInit } from '@angular/core';
import { ThemeStateService } from '../../../../services';
import { Pagination } from '@core/types';

@Component({
  selector: 'app-theme-cards',
  templateUrl: './theme-cards.component.html',
  styleUrl: './theme-cards.component.scss'
})
export class ThemeCardsComponent implements OnInit {
  state = inject(ThemeStateService);

  ngOnInit(): void {
    this.state.findPage({}).then();
  }

  async onPageChange(event: any) {
    const pagination: Pagination = this.state.parsePagination(event);
    await this.state.findPage(pagination);
  }
}