import {
    Component,
    input,
    model,
    OnChanges,
    OnInit,
    output,
    SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BadgeModule } from 'primeng/badge';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TranslateModule } from '@ngx-translate/core';

export interface FilterTabOption<T> {
    label: string;
    icon: string;
    value: T;
    counter?: number;
}
@Component({
    selector: 'app-filter-tab',
    standalone: true,
    imports: [SelectButtonModule, FormsModule, BadgeModule, TranslateModule],
    templateUrl: './filter-tab.component.html',
    styleUrl: './filter-tab.component.scss',
})
export class FilterTabComponent implements OnInit, OnChanges {
    options = input.required<FilterTabOption<any>[]>();
    onChange = output<any>();
    selectedOption = model<any>();

    ngOnInit(): void {}
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['options']) {
            this.initializeTabs();
        }
    }

    initializeTabs() {
        if (!this.selectedOption() && this.options().length) {
            this.selectedOption.set(this.options()[0]['value']);
            this.emitChange();
        }
    }

    emitChange() {
        this.onChange.emit(this.selectedOption());
    }
}
