import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import {
    FormBuilder,
    FormGroup,
    ReactiveFormsModule,
    ValidationErrors,
    Validators,
} from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { FirebaseError } from '@angular/fire/app';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { PasswordModule } from 'primeng/password';
import { SessionService } from '@core/session';
import { ToastService } from '@core/services';

function passwordsMatchValidator(group: FormGroup): ValidationErrors | null {
    const newPassword = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return newPassword && confirmPassword && newPassword !== confirmPassword
        ? { passwordsMismatch: true }
        : null;
}

/**
 * Cambio de contraseña del propio usuario (plan §7, item de `features/profile`
 * de la Fase 2). No es parte del módulo administrativo de Usuarios — cualquier
 * sesión activa puede usarlo sobre sí misma, nunca sobre otra cuenta.
 *
 * Firebase exige una sesión "reciente" para esta operación: reautenticar con
 * la contraseña actual (`SessionService.changePassword`) es lo que la
 * garantiza sin pedirle a la persona que vuelva a iniciar sesión.
 */
@Component({
    selector: 'app-change-password-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        DialogModule,
        ButtonModule,
        PasswordModule,
        TranslateModule,
    ],
    templateUrl: './change-password-dialog.component.html',
})
export class ChangePasswordDialogComponent {
    private readonly formBuilder = inject(FormBuilder);
    private readonly sessionService = inject(SessionService);
    private readonly toast = inject(ToastService);

    visible = input.required<boolean>();
    visibleChange = output<boolean>();

    saving = signal(false);
    form: FormGroup = this.buildForm();

    constructor() {
        effect(() => {
            if (this.visible()) {
                this.form = this.buildForm();
            }
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.saving.set(true);
        const { currentPassword, newPassword } = this.form.value;

        this.sessionService.changePassword(currentPassword, newPassword).subscribe({
            next: () => {
                this.saving.set(false);
                this.toast.success('app.profile.messages.passwordChanged');
                this.close();
            },
            error: (error: FirebaseError) => {
                this.saving.set(false);
                this.toast.error(this.mapErrorKey(error?.code));
            },
        });
    }

    close(): void {
        this.visibleChange.emit(false);
    }

    private buildForm(): FormGroup {
        return this.formBuilder.group(
            {
                currentPassword: [null, [Validators.required]],
                newPassword: [
                    null,
                    [Validators.required, Validators.minLength(6)],
                ],
                confirmPassword: [null, [Validators.required]],
            },
            { validators: passwordsMatchValidator },
        );
    }

    private mapErrorKey(code: string | undefined): string {
        switch (code) {
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return 'app.profile.errors.wrongCurrentPassword';
            case 'auth/weak-password':
                return 'app.validation.passwordMinLength';
            case 'auth/too-many-requests':
                return 'app.auth.errors.tooManyRequests';
            case 'auth/network-request-failed':
                return 'app.auth.errors.network';
            default:
                return 'app.common.errors.general';
        }
    }
}
