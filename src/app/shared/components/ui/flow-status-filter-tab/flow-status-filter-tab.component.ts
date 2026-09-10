import {
    Component,
    inject,
    input,
    OnChanges,
    output,
    signal,
    SimpleChanges,
} from '@angular/core';
import {
    FilterTabComponent,
    FilterTabOption,
} from '../filter-tab/filter-tab.component';
import { FlowStatus } from '@core/types';
import { TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-flow-status-filter-tab',
    standalone: true,
    imports: [FilterTabComponent],
    templateUrl: './flow-status-filter-tab.component.html',
    styleUrl: './flow-status-filter-tab.component.scss',
})
export class FlowStatusFilterTabComponent implements OnChanges {
    translate = inject(TranslateService);
    onTabChange = output<FlowStatus>();
    options = input<FlowStatus[]>();
    filterTabOptions = signal<FilterTabOption<FlowStatus>[]>([]);
    labels = input<{ [key: string]: string }>({});
    constructor() {
        this.loadTabs();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['options'] && this.options()?.length) {
            this.loadTabs();
        }
    }

    loadTabs() {
        const _options = this.options() || Object.values(FlowStatus);

        this.translate.get('app.common.flowStatus').subscribe((t) => {
            const opts: FilterTabOption<FlowStatus>[] = [];
            _options.forEach((option, index) => {
                opts.push({
                    label: this.getLabel(option.toLocaleLowerCase(), t[option.toLocaleLowerCase()]),
                    icon: index === 0 ? 'fa-regular fa-rectangle-list' : 'fa-regular fa-id-card',
                    value: option,
                });
            });
            this.filterTabOptions.set(opts);
        });
    }

    onTabChanged(option: FlowStatus) {
        if (!option) return;
        this.onTabChange.emit(option);
    }

    getLabel(key: string, translateValue: string) {
        return this.labels()[key] || translateValue;
    }
}
