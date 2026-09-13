import { Component, WritableSignal, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FirebaseError } from '@angular/fire/app';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TranslateModule } from '@ngx-translate/core';
import { SessionService } from '@core/session';

/**
 * Recuperación de contraseña.
 *
 * FASE 1: conectada a `sendPasswordResetEmail()` vía `SessionService.resetPassword()`
 * (docs/architecture/mi-pimpollito-plan.md §6.7).
 *
 * Por seguridad, un envío exitoso y la mayoría de los errores responden con
 * el MISMO mensaje neutral: no se revela si el correo está registrado. Solo
 * se distinguen los errores que no son una fuga de información (sin
 * conexión, demasiados intentos).
 */
@Component({
    selector: 'app-forget-password',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        ButtonModule,
        InputTextModule,
        TranslateModule,
    ],
    templateUrl: './forgot-password.component.html',
    styleUrl: './forgot-password.component.scss',
})
export class ForgetPasswordComponent {
    private readonly sessionService = inject(SessionService);

    protected forgotPasswordForm!: FormGroup;
    protected loading: WritableSignal<boolean> = signal(false);
    protected responseMessageKey: WritableSignal<string | null> = signal(null);
    protected success: WritableSignal<boolean> = signal(false);

    constructor() {
        this._buildForm();
    }

    public onSubmit(): void {
        if (this.forgotPasswordForm.invalid) {
            this.forgotPasswordForm.markAllAsTouched();
            return;
        }

        this.loading.set(true);
        this.responseMessageKey.set(null);
        const { email } = this.forgotPasswordForm.value;

        this.sessionService.resetPassword(email).subscribe({
            next: () => {
                this.loading.set(false);
                this.showNeutralMessage();
            },
            error: (err: FirebaseError) => {
                this.loading.set(false);

                if (err?.code === 'auth/too-many-requests') {
                    this.showError('app.auth.errors.tooManyRequests');
                } else if (err?.code === 'auth/network-request-failed') {
                    this.showError('app.auth.errors.network');
                } else {
                    // Cualquier otro código (incluido un hipotético
                    // user-not-found) responde igual que el éxito: no se
                    // revela si el correo existe (plan §6.7).
                    this.showNeutralMessage();
                }
            },
        });
    }

    private showNeutralMessage(): void {
        this.success.set(true);
        this.responseMessageKey.set('app.auth.forgotPassword.neutralMessage');
    }

    private showError(key: string): void {
        this.success.set(false);
        this.responseMessageKey.set(key);
    }

    private _buildForm(): void {
        this.forgotPasswordForm = new FormGroup({
            email: new FormControl(null, [
                Validators.required,
                Validators.email,
            ]),
        });
    }
}
