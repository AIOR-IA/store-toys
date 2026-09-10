import {
    Component,
    inject,
    input,
    InputSignal,
    output,
    OutputEmitterRef,
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
import { catchError, timer } from 'rxjs';

import { AuthService } from '@core/services';
import { IUser } from 'app/features/users/models';

@Component({
    selector: 'app-change-password',
    templateUrl: './change-password.component.html',
    styles: ``,
})
export class ChangePasswordComponent {
    public userId: InputSignal<number | undefined> = input.required();
    public closeEmitter: OutputEmitterRef<void> = output<void>();

    protected passwordForm: WritableSignal<FormGroup>;
    protected loading: WritableSignal<boolean>;
    protected success: WritableSignal<boolean>;

    private authService: AuthService;

    constructor() {
        this.authService = inject(AuthService);
        this.passwordForm = signal(new FormGroup({}));
        this.loading = signal(false);
        this.success = signal(false);
        this.buildForm();
    }

    public close(): void {
        this.closeEmitter.emit();
    }

    public get newPassword(): AbstractControl {
        return this.passwordForm().get('newPassword') ?? new FormControl();
    }

    public get confirmNewPassword(): AbstractControl {
        return this.passwordForm().get('confirmPassword') ?? new FormControl();
    }

    public onSubmit(): void {
        if (this.passwordForm().valid) {
            const { newPassword: password } = this.passwordForm().value;
            this.loading.set(true);
            this.authService
                .changePassword(this.userId()!, { password } as IUser)
                .pipe(
                    catchError((error) => {
                        this.loading.set(false);
                        this.passwordForm().reset();
                        return error;
                    }),
                )
                .subscribe(() => {
                    this.loading.set(false);
                    this.success.set(true);
                    this.passwordForm().reset();
                    timer(2000).subscribe(() => {
                        this.close();
                    });
                });
        }
    }

    private buildForm(): void {
        this.passwordForm.set(
            new FormGroup(
                {
                    newPassword: new FormControl('', [
                        Validators.required,
                        Validators.minLength(8),
                    ]),
                    confirmPassword: new FormControl('', [
                        Validators.required,
                        Validators.minLength(8),
                    ]),
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
        const password = form.get('newPassword');
        const confirmPassword = form.get('confirmPassword');

        if (
            password &&
            confirmPassword &&
            password.value !== confirmPassword.value
        ) {
            confirmPassword.setErrors({ passwordMismatch: true });
            return { passwordMismatch: true };
        }

        return null;
    }
}
