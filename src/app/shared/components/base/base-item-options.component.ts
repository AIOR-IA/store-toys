import {
    Component,
    inject,
    input,
    OnInit,
    signal,
    ViewChild,
    WritableSignal,
} from '@angular/core';
import { Router } from '@angular/router';
import { IBaseStateService } from '@core/models';
import { IHttService } from '@core/models/http-service.interface';
import { SessionService, ToastService } from '@core/services';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { catchError } from 'rxjs';
import { Identificable } from '@core/types';

@Component({
    selector: 'app-base-list-abstract',
    template: '',
})
export abstract class BaseItemOptionsComponent<T> implements OnInit {
    abstract state: IBaseStateService<T>;
    abstract service: IHttService<T>;

    confirmService = inject(ConfirmationService);
    translate = inject(TranslateService);
    router = inject(Router);
    toast = inject(ToastService);
    sessionService = inject(SessionService);
    items: WritableSignal<MenuItem[]> = signal([]);
    item = input.required<T>();

    abstract loadOptions(t: Record<string, string>): void;

    @ViewChild('menu') menu!: Menu;

    ngOnInit() {
        this.translate.get('app.common').subscribe((tCommon) => {
            this.loadOptions(tCommon);
        });
    }

    toggleMenu(event: Event) {
        if (this.menu) {
            this.menu.toggle(event);
        }
    }

    goTo(path: string) {
        this.router.navigate([path]);
    }

    disable() {
        const { id } = this.item() as Identificable;
        this.confirmService.confirm({
            message: this.translate.instant('app.common.messages.confirmDisable'),
            accept: () => {
                this.service
                    .update(id, { enabled: false } as T)
                    .pipe(
                        catchError((error) => {
                            this.state.error.set(error.error);
                            this.toast.error('app.common.messages.notDisabled');
                            return error;
                        })
                    )
                    .subscribe(() => {
                        this.state.reload();
                        this.toast.success('app.common.messages.disabled');
                    });
            },
        });
    }

    delete() {
        const { id } = this.item() as Identificable;

        this.confirmService.confirm({
            message: this.translate.instant('app.common.messages.confirmDelete'),
            header: this.translate.instant('app.common.confirm'),
            icon: 'fas fa-exclamation-triangle',
            accept: () => {
                this.service.delete(id)
                    .pipe(
                        catchError((error) => {
                            this.state.error.set(error.error);
                            this.toast.error('app.common.messages.notDeleted');
                            return error;
                        })
                    )
                    .subscribe(() => {
                        this.state.reload();
                        this.toast.success('app.common.messages.deleted');
                    });
            },
        });
    }
}
