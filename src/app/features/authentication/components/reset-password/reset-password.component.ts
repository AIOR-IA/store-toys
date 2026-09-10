import { Component, signal, WritableSignal } from '@angular/core';
import { FormControl } from '@angular/forms';

import { BasePasswordFormComponent } from '../base-password-form/base-password-form.component';
import { catchError } from 'rxjs';
import { IUser } from 'app/features/users/models';

@Component({
    selector: 'app-reset-password',
    templateUrl: './reset-password.component.html',
    styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent extends BasePasswordFormComponent {
    protected success: WritableSignal<boolean>;

    constructor() {
        super();
        this.success = signal(false);
        this.title = signal('Reestablecer contraseña');
        this.instructions = signal(
            `Para reestablecer su contraseña, por favor completa los datos del formulario a continuación.`,
        );
        this.errorMessage = signal(
            `El enlace ha expirado o no es válido.
             Si cree que esto es un error, por favor solicite un nuevo correo de confirmación al administrador.`,
        );
    }

    public override onSubmit(): void {
        if (this.form().valid) {
            this.loading.set(true);
            this.success.set(false);
            const { username, password } = this.form().value;
            this.service
                .resetPassword(this.user().id, { username, password } as IUser)
                .pipe(
                    catchError((error) => {
                        this.totast.error('app.common.messages.notUpdated');
                        return error;
                    }),
                )
                .subscribe(() => {
                    this.loading.set(false);
                    this.success.set(true);
                });
        } else {
            this.totast.error('app.common.messages.invalidForm');
        }
    }

    public override loadUser(): void {
        this.service
            .findUserByResetPasswordToken(this.params().token)
            .subscribe({
                next: (user) => {
                    this.user.set(user);
                    this.form().setControl(
                        'username',
                        new FormControl(user.username),
                    );
                },
                error: () => {
                    this.tokenExpired.set(true);
                    console.error('Token expired or not found');
                },
            });
    }
}
