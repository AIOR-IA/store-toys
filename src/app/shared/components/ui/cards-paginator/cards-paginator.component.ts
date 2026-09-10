import { Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-cards-paginator',
    standalone: true,
    imports: [TranslateModule, ButtonModule],
    templateUrl: './cards-paginator.component.html',
    styleUrl: './cards-paginator.component.scss',
})
export class CardsPaginatorComponent {
    hasNextPage = input.required<boolean>();
    hasPreviousPage = input.required<boolean>();

    onNext = output<any>();
    onPrevious = output<any>();

    onPreviousPage(event: any): void {
        this.onPrevious.emit(event);
    }

    onNextPage(event: any): void {
        console.log('Next page, paginator');
        this.onNext.emit(event);
    }
}
