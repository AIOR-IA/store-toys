import { Component, inject, OnInit } from '@angular/core';
import { CommunityStateService } from '../../../../services';

@Component({
    selector: 'app-communities-cards',
    templateUrl: './communities-cards.component.html',
    styleUrl: './communities-cards.component.scss',
})
export class CommunityCardsComponent implements OnInit {
    state = inject(CommunityStateService);

    ngOnInit(): void {
        this.state.findPage({}).then();
    }

    onNextPage(event: any): void {
        this.state.findNextPage().then();
    }

    onPreviousPage(event: any): void {
        this.state.findPreviousPage().then();
    }
}
