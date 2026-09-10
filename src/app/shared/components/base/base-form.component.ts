import {
    Component,
    computed,
    effect,
    HostListener,
    inject,
    input,
    OnInit,
    output,
    Signal,
    signal,
    WritableSignal,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ToastService } from '@core/services';
import { FormModeType } from '@core/types';
import { TranslateService } from '@ngx-translate/core';
import { catchError } from 'rxjs';
import { IBaseStateService } from '@core/models';
import { IHttService } from '@core/models/http-service.interface';
import { Router } from '@angular/router';

@Component({
    selector: 'app-base-form-abstract',
    template: '',
})
export abstract class BaseFormComponent<T> implements OnInit {
    translate = inject(TranslateService);
    _fb = inject(FormBuilder);
    totast = inject(ToastService);
    router = inject(Router);
    mode = input<FormModeType>('view');
    redirectAfterCreate = input<boolean>(true);
    redirectAfterUpdate = input<boolean>(true);
    redirectUrl = input<string>();
    protected _redirectAfterCreate = signal(true);
    protected _redirectAfterUpdate = signal(true);
    onSaved = output<T>();
    abstract service: IHttService<T>;
    abstract state: IBaseStateService<T>;
    saving = signal(false);

    protected uniqueFields: WritableSignal<(keyof T)[]> = signal([]);

    form!: FormGroup;

    constructor() {
        effect(
            () => {
                try {
                    this.buildForm();
                } catch (error) {}
            },
            { allowSignalWrites: true }
        );
        this.saving.set(false);
    }

    ngOnInit(): void {
        this.buildForm();
        this._redirectAfterCreate.set(this.redirectAfterCreate());
        this._redirectAfterUpdate.set(this.redirectAfterUpdate());
    }

    abstract buildForm(): void;

    get f() {
        return this.form.controls;
    }

    get isCreateMode(): boolean {
        return this.mode() === 'create';
    }

    get isUpdateMode(): boolean {
        return this.mode() === 'update';
    }

    get isViewMode(): boolean {
        return this.mode() === 'view';
    }

    protected onSubmit(onSuccess?: (response: any) => void): void {
        if (this.form.invalid) {
            this.totast.error('app.common.errors.invalidForm');
            return;
        }
        const postData = this.form.value;
        this.saving.set(true);
        const { id } = postData;
        if (id) {
            this.service
                .update(id, postData)
                .pipe(
                    catchError((error) => {
                        this.totast.error('app.common.messages.notUpdated');
                        this.saving.set(false);
                        return error;
                    })
                )
                .subscribe((response) => {
                    this.totast.success('app.common.messages.updated');
                    this.onSaved.emit(response as T);
                    onSuccess?.(response);
                    this.saving.set(false);
                });
            return;
        }

        // Create
        this.service
            .create(postData)
            .pipe(
                catchError((error) => {
                    this.totast.error('app.common.messages.notCreated');
                    this.saving.set(false);
                    return error;
                })
            )
            .subscribe((response: any) => {
                this.totast.success('app.common.messages.created');
                this.onSaved.emit(response as T);
                onSuccess?.(response);
                if (this._redirectAfterCreate()) {
                    let url = this.redirectUrl();
                    if (!url) {
                        const currentUrl = this.router.url;
                        url = currentUrl.replace(/\/new.*/, '');
                        if (/\/new\/.*/.test(currentUrl) && response.parent) {
                            //It is a child
                            url = url + '/' + response.parent.uuid;
                        }
                    }

                    this.router.navigate([url]).then();
                }
                this.saving.set(false);
            });
    }

    @HostListener('window:beforeunload', ['$event'])
    unloadNotification($event: { returnValue: boolean }): void {
        if (this.form.dirty) {
            $event.returnValue = true; // show warning before reload
        }
    }

    protected onBlurUniqueField(field: keyof T) {
        let currentValue;
        if (this.state.current) currentValue = this.state.current[field];
        const formField = this.f[String(field)] as any;
        const isValidField = formField?.value && formField?.valid;
        const valueHasChanged =
            formField['_pendingDirty'] && formField?.value !== currentValue;

        const isValidUpdateMode = this.mode() === 'update' && valueHasChanged;
        if (isValidField && (isValidUpdateMode || this.mode() === 'create')) {
            this.service
                .validateFieldUniqueness(field, formField.value.trim())
                .pipe(
                    catchError(() => {
                        formField.setErrors({ alreadyExist: true });
                        return [];
                    })
                )
                .subscribe(() => {
                    formField.setErrors(null);
                });
        }
    }
    onUploadedFile(data: any, fieldName: string): void {
        const { files } = data;
        if (files.length && fieldName) {
            this.form.patchValue({
                [fieldName]: files[0].id,
            });
        }
    }
}
