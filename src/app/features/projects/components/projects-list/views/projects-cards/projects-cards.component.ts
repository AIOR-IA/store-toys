import { Component, inject, OnInit } from '@angular/core';
import { ProjectStateService } from '../../../../services';

@Component({
    selector: 'app-projects-cards',
    templateUrl: './projects-cards.component.html',
    styleUrl: './projects-cards.component.scss',
})
export class ProjectCardsComponent implements OnInit {
    state = inject(ProjectStateService);

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
