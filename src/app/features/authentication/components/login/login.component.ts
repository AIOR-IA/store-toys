import { AuthService, SessionService } from '@core/services';
import {
    Component,
    OnDestroy,
    OnInit,
    signal,
    WritableSignal,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Subject, takeUntil } from 'rxjs';
import { UsernameOrEmailValidator } from '@shared/form-validators';
import { RESOURCES, UserContextEnum, UserContextType } from '@shared/constants';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
    protected userRequestLoading: WritableSignal<boolean>;
    protected loading: WritableSignal<boolean>;

    showPopup = false;
    userType: UserContextType | null = null;
    errorLogin = signal(false);
    loginForm!: FormGroup;

    private unsubscribe: Subject<boolean>;
    expired = signal<boolean>(false);

    showActivatePopup = false;
    activationForm!: FormGroup;
    activating = signal(false);
    activateError = signal(false);
    activateSuccess = signal(false);

    verified = signal<boolean | null>(null);
    constructor(
        private readonly authService: AuthService,
        private readonly sessionService: SessionService,
        private readonly formBuilder: FormBuilder,
        private readonly router: Router,
        private readonly messageService: MessageService,
        private readonly route: ActivatedRoute,
    ) {
        this.userRequestLoading = signal(false);
        this.unsubscribe = new Subject();
        this.loading = signal(false);
    }

    ngOnInit(): void {
        this.loginForm = this.formBuilder.group({
            username: [null, [Validators.required, UsernameOrEmailValidator]],
            password: [null, [Validators.required, Validators.minLength(8)]],
            context: [null],
        });

        this.activationForm = this.formBuilder.group({
            email: [null, [Validators.required, Validators.maxLength(50), UsernameOrEmailValidator]],
        });

        this.route.queryParams.subscribe((params) => {
            this.expired.set(params['expired'] === 'true');
        });
    }

    ngOnDestroy(): void {
        this.unsubscribe.next(true);
        this.unsubscribe.complete();
    }

    onSubmit(): void {
        if (this.loginForm.valid) {
            this.loading.set(true);
            const { username, password, context } = this.loginForm.value;
            // Call the authentication service with user and password
            this.authService.login(username, password, context).subscribe({
                next: (value) => {
                    const isOfficer = (context === UserContextEnum.AGENT_OFFICER || context === UserContextEnum.REPRESENTANT);
                    const hasPermissions = this.sessionService.canRead(RESOURCES.USERS);

                    if (!hasPermissions) {
                        location.href = '/';
                        return;
                    }

                    if (isOfficer) {
                        location.href = '/';
                        return;
                    }
                    location.href = '/admin/users';
                },
                error: () => {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Credenciales incorrectas',
                        detail: 'Usuario o contraseña incorrectos. Por favor, verifica tus credenciales e intenta nuevamente.',
                    });
                    this.loading.set(false);
                    this.errorLogin.set(true);
                },
                complete: () => {
                    this.loading.set(false);
                    this.errorLogin.set(false);
                },
            });
        }
    }

    get form(): any {
        return this.loginForm.controls;
    }


    openPopup(type: UserContextType) {
        this.userType = type;
        this.showPopup = true;
        this.loginForm.patchValue({
            context: type,
        });
    }

    closePopup() {
        this.showPopup = false;
        this.userType = null;
    }

    openActivatePopup() {
        this.showActivatePopup = true;
        this.activateError.set(false);
        this.activateSuccess.set(false);
        this.verified.set(null);
        this.activationForm.reset();
    }

    closeActivatePopup() {
        this.showActivatePopup = false;
    }

    activateAccount() {
        if (!this.activationForm.valid || this.activating()) return;

        this.activating.set(true);
        this.activateError.set(false);
        this.activateSuccess.set(false);

        const { email } = this.activationForm.value;
        this.authService.validateActivation({ email })
            .subscribe({
                next: ({ valid }) => {
                    this.verified.set(valid);

                    if (valid) {
                        this.activateSuccess.set(true);
                        this.activateError.set(false);
                    } else {
                        this.activateSuccess.set(false);
                        this.activateError.set(true);
                    }

                    this.activating.set(false);
                },
                error: () => {
                    this.verified.set(false);
                    this.activateError.set(true);
                    this.activateSuccess.set(false);
                    this.activating.set(false);
                },
            });
    }
}
