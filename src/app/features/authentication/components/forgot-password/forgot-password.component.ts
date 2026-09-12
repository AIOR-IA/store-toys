import { Component, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

/**
 * Recuperación de contraseña.
 *
 * FASE 0A: la pantalla se conserva pero SIN backend. El envío real se conecta
 * en la FASE 1 con `sendPasswordResetEmail()` de Firebase Auth
 * (docs/architecture/mi-pimpollito-plan.md §6.7), con respuesta neutra: el
 * mensaje no debe revelar si el correo existe.
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
    ],
    templateUrl: './forgot-password.component.html',
    styleUrl: './forgot-password.component.scss',
})
export class ForgetPasswordComponent {
    protected forgotPasswordForm!: FormGroup;
    protected loading: WritableSignal<boolean>;
    protected responseMessage: WritableSignal<string>;
    protected attemptsMessage: WritableSignal<string>;
    protected success: WritableSignal<boolean>;

    constructor() {
        this.responseMessage = signal('');
        this.attemptsMessage = signal('');
        this.loading = signal(false);
        this.success = signal(false);
        this._buildForm();
    }

    public onSubmit(): void {
        if (this.forgotPasswordForm.invalid) {
            this.forgotPasswordForm.markAllAsTouched();
            return;
        }

        // FASE 1: aquí va sendPasswordResetEmail(). Hasta entonces no hay envío.
        this.success.set(false);
        this.responseMessage.set(
            'La recuperación de contraseña se habilita en la siguiente fase.',
        );
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
