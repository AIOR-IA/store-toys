import {
    Component,
    effect,
    inject,
    input,
    InputSignal,
    OnChanges,
    signal,
    SimpleChanges,
    WritableSignal,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FileTypes, FormModeType } from '@core/types';
import { Cities } from '@shared/constants';
import { IUser } from 'app/features/users/models';
import { UsersService } from 'app/features/users/services';
import { catchError, debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { RolesService } from '../../../../../roles/services/role.service';
import { IRole } from '../../../../../roles/models/role.interface';
import { RoleModel } from '../../../../../roles/models/role.model';
import { UserStateService } from '../../../../services/user-state.service';

@Component({
    selector: 'app-user-form-personal-info',
    templateUrl: './personal-info.component.html',
    styleUrl: './personal-info.component.scss',
})
export class PersonalInfoComponent implements OnChanges {
    form = input.required<FormGroup>();
    mode: InputSignal<FormModeType> = input.required<FormModeType>();
    stateUsers = inject(UserStateService);
    allowedFileTypes = FileTypes.PDF;

    private _userWithUniqueFields: WritableSignal<Partial<IUser>>;
    private userService: UsersService = inject(UsersService);

    roleService = inject(RolesService);

    roles = signal<IRole[]>([]);
    currentRole: WritableSignal<RoleModel[]> = signal([]);
    rolesSubject = new Subject<{ query: string }>();
    selectedRoles: number[] = [];
    constructor() {
        this._userWithUniqueFields = signal({} as Partial<IUser>);

        this.initData();
        this.rolesSubject.next({ query: '' });

        effect(() => {
            const mode = this.mode();
            const ctrl = this.form()?.get('roleIds');

            if (mode === 'create') {
                this.selectedRoles = [];
                ctrl?.setValue([]);
                ctrl?.markAsPristine();
                ctrl?.markAsUntouched();
                return;
            }

            const roleUsers: any[] = this.stateUsers.current?.roleUsers ?? [];
            const ids = roleUsers.map((ru: any) => ru.roleId);

            this.selectedRoles = ids;

            ctrl?.setValue(ids);
        }, { allowSignalWrites: true });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['form'] && changes['form'].currentValue) {
            this._buildUniqueFields();
        }
    }

    get f() {
        return this.form().controls;
    }



    onUploaded(event: any) {
        const { files } = event;
        if (files?.length) {
            // this.data.fileId = files[0].id;
            // this.file = files;

            console.log(files);
        }
    }

    public onBlurEmail() {
        this._onBlurUniqueField('email');
    }

    public onBlurUsername() {
        this._onBlurUniqueField('username');
    }

    private _onBlurUniqueField(field: keyof IUser) {
        const formField = this.f[field];
        const isValidField = formField?.value && formField?.valid;
        const isValidUpdateMode =
            this.mode() === 'update' &&
            formField?.value !== this._userWithUniqueFields()[field];

        if (isValidField && (isValidUpdateMode || this.mode() === 'create')) {
            this.userService
                .checkUserExist(formField.value.trim())
                .pipe(
                    catchError(() => {
                        formField.setErrors(null);
                        return [];
                    }),
                )
                .subscribe(() => {
                    formField.setErrors({ alreadyExist: true });
                });
        }
    }

    private _buildUniqueFields() {
        const uniquesFields: (keyof IUser)[] = ['email', 'username'];
        for (const field of uniquesFields) {
            this._userWithUniqueFields.update((user) => {
                user[field] = this.form().get(field)?.value;
                return user;
            });
        }
    }

    initData() {
        const userId = this.stateUsers.current?.id;

        this.rolesSubject
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe(({ query }) => {
                this.stateUsers
                    .findRoles({
                        filter: JSON.stringify({ userId }),
                        sort: 'name',
                        order: 'asc',
                        query,
                        perPage: 120,
                        page: 1,
                    })
                    .then();
            });
    }

    filterRoles(event: any) {
        const query = event.filter;
        this.rolesSubject.next({ query });
    }

    async onRolesChange(event: any) {
        const ids: number[] = event.value;

        // await this.loadInfoCurentRoles(ids);
    }
}
