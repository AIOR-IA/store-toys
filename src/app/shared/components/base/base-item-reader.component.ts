import {
    Component,
    effect,
    inject,
    signal,
    WritableSignal,
} from '@angular/core';
import { UrlParamsReader } from '@core/base';
import { IBaseStateService } from '@core/models';
import { TranslateService } from '@ngx-translate/core';
import {  MenuItem } from 'primeng/api';
import { Mixin } from 'ts-mixer';

@Component({
    selector: 'app-base-item-reader-abstract',
    template: '',
})
export abstract class BaseItemReaderComponent<T> extends Mixin(
    UrlParamsReader,
) {
    abstract state: IBaseStateService<T>;

    translate = inject(TranslateService);
    breadcrumbItems: WritableSignal<MenuItem[]> = signal([]);

    abstract loadBreadcrumb(): void;
    constructor() {
        super();

        effect(
            () => {
                this.findOne();
                this.loadBreadcrumb();
            },
            { allowSignalWrites: true },
        );
    }

    findOne(): void {
        const uuid = this.params().uuid;

        if (!uuid) return;
        this.state.findItem(uuid);
    }
}
