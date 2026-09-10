import {
    Component,
    inject,
    OnInit,
    signal,
    WritableSignal,
} from '@angular/core';
import { IBaseStateService } from '@core/models';
import { TranslateService } from '@ngx-translate/core';
import { GRID_VIEW, LIST_VIEW } from '@shared/constants';
import { MenuItem } from 'primeng/api';

@Component({
    selector: 'app-base-list-abstract',
    template: '',
})
export abstract class BaseListComponent<T> implements OnInit {
    abstract state: IBaseStateService<T>;

    translate = inject(TranslateService);
    breadcrumbItems: WritableSignal<MenuItem[]> = signal([]);
    currentView: WritableSignal<string> = signal(LIST_VIEW);

    abstract loadBreadcrumb(): void;
    abstract loadTabs(): void;

    ngOnInit(): void {
        this.loadBreadcrumb();
        this.loadTabs();
    }

    onViewChange(view: string) {
        this.currentView.set(view);
    }

    onSearch(searchValue: string) {
        this.state.findPage({ query: searchValue });
    }

    get isGridView() {
        return this.currentView() === GRID_VIEW;
    }

    get isListView() {
        return this.currentView() === LIST_VIEW;
    }
}
