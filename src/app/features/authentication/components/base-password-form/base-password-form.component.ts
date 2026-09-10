import {
    Component,
    inject,
    OnInit,
    signal,
    WritableSignal,
} from '@angular/core';
import {
    AbstractControl,
    FormControl,
    FormGroup,
    ValidationErrors,
    Validators,
} from '@angular/forms';
import { UrlParamsReader } from '@core/base';
import { AuthService, ToastService } from '@core/services';
import { IUser } from 'app/features/users/models';

@Component({
    selector: 'app-base-password-form',
    template: '',
})
export abstract class BasePasswordFormComponent
    extends UrlParamsReader
    implements OnInit
{
    public title: WritableSignal<string>;
    public instructions: WritableSignal<string>;
    public errorMessage: WritableSignal<string>;

    protected form!: WritableSignal<FormGroup>;
    protected loading: WritableSignal<boolean>;
    protected tokenExpired: WritableSignal<boolean>;
    protected user: WritableSignal<IUser>;
    protected service = inject(AuthService);
    protected totast = inject(ToastService);

    constructor() {
        super();
        this.loading = signal(false);
        this.user = signal({} as IUser);
        this.tokenExpired = signal(false);
        this.title = signal('');
        this.instructions = signal('');
        this.errorMessage = signal('');
        this.form = signal(new FormGroup({}));
        this.buildForm();
    }

    ngOnInit(): void {
        this.loadUser();
    }

    public get username(): AbstractControl {
        return this.form().get('username') ?? new FormControl();
    }

    public get password(): AbstractControl {
        return this.form().get('password') ?? new FormControl();
    }

    public get confirmPassword(): AbstractControl {
        return this.form().get('confirmPassword') ?? new FormControl();
    }

    public abstract onSubmit(): void;

    public abstract loadUser(): void;

    private buildForm(): void {
        this.form.set(
            new FormGroup(
                {
                    password: new FormControl('', [
                        Validators.required,
                        Validators.minLength(8),
                    ]),
                    confirmPassword: new FormControl('', [Validators.required]),
                    username: new FormControl('', [Validators.required]),
                },
                {
                    validators: this.passwordMatchValidator,
                },
            ),
        );
    }

    private passwordMatchValidator(
        form: AbstractControl,
    ): ValidationErrors | null {
        const password = form.get('password');
        const confirmPassword = form.get('confirmPassword');

        if (
            password &&
            confirmPassword &&
            password.value !== confirmPassword.value
        ) {
            confirmPassword.setErrors({
                ...confirmPassword.errors,
                passwordMismatch: true,
            });
            return { passwordMismatch: true };
        }

        return null;
    }
}
