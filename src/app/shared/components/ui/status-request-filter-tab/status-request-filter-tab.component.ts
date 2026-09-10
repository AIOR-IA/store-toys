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
import { TranslateService } from '@ngx-translate/core';
import { RequestStatus } from 'app/features/public/user-request/natural/types';
@Component({
    selector: 'app-status-request-filter-tab',
    standalone: true,
    imports: [FilterTabComponent],
    templateUrl: './status-request-filter-tab.component.html',
})
export class StatusRequestFilterTabComponent implements OnChanges {
    translate = inject(TranslateService);
    onTabChange = output<RequestStatus>();
    options = input<FilterTabOption<RequestStatus>[]>();
    filterTabOptions = signal<FilterTabOption<RequestStatus>[]>([]);
    labels = input<{ [key: string]: string }>({});
    tab = input<RequestStatus>();
    constructor() {
        this.loadTabs();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['options'] && this.options()?.length) {
            this.loadTabs();
        }
    }

    loadTabs() {
        const _options = this.options() || [];
        const iconMap: Record<string, string> = {
            submitted: 'far fa-share-from-square',
            derivation_process: 'fas fa-user-injured',
            review: 'fa-regular fa-paper-plane',
            approved: 'fa-regular fa-circle-check',
            rejected: 'fa-solid fa-xmark',
            observed: 'fa-solid fa-xmark',
            draft: 'fa-solid fa-arrow-up-right-dots',
            revoked: 'fa-solid fa-ban',

            derive: 'fa-solid fa-clipboard-check',
            discard: 'fa-solid fa-trash',
            to_review: 'fa-solid fa-mobile',
        };

        this.translate.get('app.common.flowStatus').subscribe((t) => {
            const opts: FilterTabOption<RequestStatus>[] = [];
            _options.forEach((option, index) => {
                const key = option.value.toLowerCase();
                opts.push({
                    label: this.getLabel(key, t[key]),
                    icon: iconMap[key] || 'fa-regular fa-circle-question',
                    value: option.value,
                    counter: option.counter,
                });
            });

            this.filterTabOptions.set(opts);
        });
    }

    onTabChanged(option: RequestStatus) {
        if (!option) return;
        this.onTabChange.emit(option);
    }

    getLabel(key: string, translateValue: string) {
        return this.labels()[key] || translateValue;
    }
}
