import { CommonModule } from '@angular/common';
import {
    Component,
    input,
    model,
    OnChanges,
    output,
    SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

@Component({
    selector: 'app-search-bar',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        TranslateModule,
    ],
    templateUrl: './search-bar.component.html',
    styleUrl: './search-bar.component.scss',
})
export class SearchBarComponent implements OnChanges {
    query = input<string | null>(null);
    searchValue = model<string>('');
    onSearch = output<string>();
    thin = input<boolean>(false);
    placeholder = input<string>();
    title = input<string>();
    compact = input<boolean>(false);

    ngOnChanges(changes: SimpleChanges): void {
        if(changes['query']) {
            this.searchValue.set(this.query() || '');
        }
    }
    search() {
        this.onSearch.emit(this.searchValue());
    }
}
