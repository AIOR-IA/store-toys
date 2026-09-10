import { Component, inject, model, OnInit, signal } from '@angular/core';
import { Validators } from '@angular/forms';
import { SessionService } from '@core/services';
import { FlowStatus } from '@core/types';
import { BaseFormComponent, FilterTabOption } from '@shared/components';
import { IUser } from 'app/features/users/models';
import { UsersService, UserStateService } from 'app/features/users/services';
import dayjs from 'dayjs';
import { catchError } from 'rxjs';
import { ToastService } from '../../../../../core/services/toast.service';
import {
    AddressValidator,
    CiValidator,
    CodeTextValidator,
    NormalizeTextValidator,
    PhoneValidator,
    trimmedRequiredValidator,
    UsernameValidator,
} from '@shared/form-validators';

type TabOptions = 'PERSONAL_INFO' | 'CONTACT_INFO' | 'INSTITUTIONAL_INFO';

@Component({
    selector: 'app-user-form',
    templateUrl: './form.component.html',
    styleUrl: './form.component.scss',
})
export class UserFormComponent
    extends BaseFormComponent<IUser>
    implements OnInit
{
    filterTabOptions = signal<FilterTabOption<TabOptions>[]>([]);
    currentTab = signal('' as TabOptions);
    service = inject(UsersService);
    session = inject(SessionService);
    state = inject(UserStateService);
    toast = inject(ToastService);

    userState = inject(UserStateService);

    constructor() {
        super();

    }

    override ngOnInit(): void {
        super.ngOnInit();
        this.onSaved.subscribe((response) => {
            const { id } = response;
            this.form.setValue({ ...this.form.value, id });
        });
    }

    override buildForm() {
        let current = {} as IUser;
        let rIds: number[] = [];

        if (this.state.current && (this.isUpdateMode || this.isViewMode)) {
            current = this.state.current;
            rIds = current.roleUsers
                ?.filter(ru =>  ru.role.code === 'OFFICE_ADMIN')
                .map(ru => ru.roleId) ?? [];
        }

        if(this.state.current && this.isCreateMode) {
            rIds = [];
        }

        this.form = this._fb.group({
            id: [current.id],
            username: [
                current.username,
                [
                    Validators.required,
                    Validators.minLength(3),
                    trimmedRequiredValidator,
                    UsernameValidator,
                ],
            ],
            email: [current.email, [Validators.required, Validators.email]],
            roleIds: [rIds, [Validators.required]],
            enabled: [current.enabled ?? true],
            firstName: [
                current.firstName?.trim(),
                [
                    Validators.required,
                    NormalizeTextValidator,
                    trimmedRequiredValidator,
                ],
            ],
            paternalLastName: [
                current.paternalLastName,
                [
                    Validators.required,
                    NormalizeTextValidator,
                    trimmedRequiredValidator,
                ],
            ],
            maternalLastName: [
                current.maternalLastName,
                [trimmedRequiredValidator, NormalizeTextValidator],
            ],
            flowStatus: [current.flowStatus || FlowStatus.REVIEW],
        });

        if (this.isViewMode) {
            this.form.disable();
        }
    }

    onTabChange(option: TabOptions) {
        if (!option) return;
        this.currentTab.set(option);
    }


    override onSubmit() {

        super.onSubmit((response) => {
            console.log({response});
            this.userState.reload();
            const rIds = response.roleUsers.map((ru: any) => ru.roleId);
            const idUser = response.id;

            if (
                response.flowStatus === 'REVIEW' &&
                rIds.length > 0
            ) {
                console.log('entroooo');
                this.service
                    .resendConfirmEmail(idUser)
                    .pipe(
                        catchError((error) => {
                            console.error(
                                'Error resending confirm email:',
                                error
                            );
                            this.toast.error('app.common.messages.notResent');
                            return error;
                        })
                    )
                    .subscribe(() => {
                        this.saving.set(false);
                        this.router.navigate(['/admin/users']);
                        this.toast.success('app.common.messages.resent');
                    });
            }

            if(this.isUpdateMode && response) {
                this.userState.ref.close(response);
            }

        });
    }
}
