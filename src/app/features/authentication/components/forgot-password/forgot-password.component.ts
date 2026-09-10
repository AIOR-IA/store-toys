import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal, WritableSignal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { UrlParamsReader } from '@core/base';
import { AuthService } from '@core/services';

@Component({
    selector: 'app-forget-password',
    templateUrl: './forgot-password.component.html',
    styleUrl: './forgot-password.component.scss',
})
export class ForgetPasswordComponent extends UrlParamsReader{
    protected forgotPasswordForm!: FormGroup;
    protected loading: WritableSignal<boolean>;
    protected responseMessage: WritableSignal<string>;
    protected attemptsMessage: WritableSignal<string>;
    protected success: WritableSignal<boolean>;

    private _authService: AuthService;

    constructor() {
        super();
        this.responseMessage = signal('');
        this.attemptsMessage = signal('');
        this.loading = signal(false);
        this.success = signal(false);
        this._authService = inject(AuthService);
        this._buildForm();
    }

    public onSubmit(): void {
        this.loading.set(true);
        this.responseMessage.set('');
        const { email } = this.forgotPasswordForm.value;
        this._authService.forgotPassword(email, this.params().ctx).subscribe({
            next: (response: {
                message: string;
                passwordResetAttempts: number;
                maxPasswordResetAttempts: number;
            }) => {
                this.loading.set(false);
                this.success.set(true);
                this.responseMessage.set(
                    'Se ha enviado un correo con las instrucciones para restablecer la contraseña.',
                );
                const passwordResetAttempts = response.passwordResetAttempts;
                const maxPasswordResetAttempts =
                    response.maxPasswordResetAttempts;
                this.attemptsMessage.set(
                    `Solicitudes realizadas: ${passwordResetAttempts} / ${maxPasswordResetAttempts}`,
                );
                this.forgotPasswordForm.reset();
            },
            error: (error: HttpErrorResponse) => {
                this.loading.set(false);
                this.success.set(false);
                const passwordResetAttempts = error.error.passwordResetAttempts;
                const maxPasswordResetAttempts =
                    error.error.maxPasswordResetAttempts;
                this.attemptsMessage.set(
                    `Solicitudes realizadas: ${passwordResetAttempts} / ${maxPasswordResetAttempts}`,
                );
                this.responseMessage.set(this._getErrorMessage(error.status));
            },
        });
    }

    private _buildForm(): void {
        this.forgotPasswordForm = new FormGroup({
            email: new FormControl(null, [
                Validators.required,
                Validators.email,
            ]),
        });
    }

    private _getErrorMessage(status: number): string {
        if (status === 404) {
            return 'El correo electrónico no está registrado. Por favor, verifique que el correo sea correcto';
        }

        if (status === 429) {
            return 'Se ha excedido el número de intentos permitidos por día. Por favor, intente más tarde.';
        }

        return 'Ha ocurrido un error, por favor verifique que el correo sea correcto.';
    }
}
