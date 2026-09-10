import {
    Component,
    computed,
    inject,
    OnInit,
    signal,
    Signal,
    WritableSignal,
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { SessionService } from '@core/services';
import { TranslateService } from '@ngx-translate/core';
import { IUser } from 'app/features/users/models';
import { MenuItem, MessageService } from 'primeng/api';
import { objectsDiffer } from '../../utils/objects-differ';
import { ProfileService } from '../../services/profile.service';
import { catchError } from 'rxjs';
import { RESOURCES } from '@shared/constants';
import { SystemAccessPermissions } from '@core/types';

@Component({
    selector: 'app-profile',
    templateUrl: './profile.component.html',
    styles: ``,
})
export class ProfileComponent implements OnInit {
    protected user: Signal<Partial<IUser>>;
    protected breadcrumbItems: WritableSignal<MenuItem[]>;
    protected showChangePassword: WritableSignal<boolean>;
    protected profileForm: WritableSignal<FormGroup>;
    protected hasChanged: WritableSignal<boolean>;
    protected loading: WritableSignal<boolean>;

    private sessionService: SessionService;
    private profileService: ProfileService;
    private toastService: MessageService;
    private translate: TranslateService;

    constructor() {
        this.user = computed(() => this.sessionService.user());
        this.breadcrumbItems = signal([]);
        this.showChangePassword = signal(false);
        this.hasChanged = signal(false);
        this.loading = signal(false);
        this.profileForm = signal(new FormGroup({}));

        this.sessionService = inject(SessionService);
        this.translate = inject(TranslateService);
        this.profileService = inject(ProfileService);
        this.toastService = inject(MessageService);

        this.buildForm();

        this.profileForm().valueChanges.subscribe(() => {
            this.checkChanges();
        });
    }

    ngOnInit(): void {
        this.translate.get('app.profile').subscribe((t) => {
            this.breadcrumbItems.set([
                {
                    label: t.title,
                    routerLink: '/profile',
                },
            ]);
        });
    }

    public toggleShowChangePassword(): void {
        this.showChangePassword.set(!this.showChangePassword());
    }

    public resetForm(): void {
        this.buildForm();
        this.hasChanged.set(false);
    }

    public get resource() {
        return RESOURCES.PROFILE;
    }

    public get action() {
        return SystemAccessPermissions.CAN_UPDATE;
    }

    public onSubmit(): void {
        if (this.profileForm().valid) {
            this.loading.set(true);
            this.profileService
                .update(this.user().id!, {
                    ...this.profileForm().value,
                    flowStatus: this.user().flowStatus,
                })
                .pipe(
                    catchError((error) => {
                        this.loading.set(false);
                        this.toastService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Error al actualizar el perfil.',
                        });
                        return error;
                    }),
                )
                .subscribe(() => {
                    this.hasChanged.set(false);
                    this.loading.set(false);
                    this.toastService.add({
                        severity: 'success',
                        summary: 'Éxito',
                        detail: 'Perfil actualizado correctamente.',
                    });
                });
        }
    }

    private buildForm(): void {
        this.profileForm.set(
            new FormGroup({
                firstName: new FormControl(this.user().firstName ?? null),
                paternalLastName: new FormControl(
                    this.user().paternalLastName ?? null,
                ),
                maternalLastName: new FormControl(
                    this.user().maternalLastName ?? null,
                ),

            }),
        );
    }

    private checkChanges(): void {
        const hasChanged = objectsDiffer(
            {
                firstName: this.user().firstName ?? null,
                paternalLastName: this.user().paternalLastName ?? null,
                maternalLastName: this.user().maternalLastName ?? null,

            },
            this.profileForm().value,
        );

        this.hasChanged.set(hasChanged);
    }
}
