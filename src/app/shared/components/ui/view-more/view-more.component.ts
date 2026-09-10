import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TruncateTextPipe } from '@shared/pipes';

@Component({
    selector: 'app-view-more',
    standalone: true,
    imports: [CommonModule, TruncateTextPipe],
    templateUrl: './view-more.component.html',
})
export class ViewMoreComponent {
    text = input<string>();
    max = input<number>(300);
    viewCompleteText: boolean = false;

    get isTextLongerThanMax(): boolean {
        const text = this.text();
        return !!(text && text.length > this.max());
    }
}
