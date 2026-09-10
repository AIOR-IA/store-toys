import { Component, inject, signal } from '@angular/core';
import { BasePasswordFormComponent } from '../base-password-form/base-password-form.component';
import { catchError } from 'rxjs';
import { IUser } from 'app/features/users/models';
import { FormControl } from '@angular/forms';

@Component({
    selector: 'app-account-ation',
    templateUrl: './account-confirmation.component.html',
    styleUrl: './account-confirmation.component.scss',
})
export class AccountConfirmationComponent extends BasePasswordFormComponent {

    constructor() {
        super();
        this.title = signal('Confirmar Cuenta');
        this.instructions = signal(
            `Para confirmar tu cuenta, por favor completa los datos del formulario a continuación.`,
        );
        this.errorMessage = signal(
            `El enlace de confirmación ha expirado o no es válido.
            Si cree que esto es un error, por favor solicite un nuevo correo de confirmación al administrador.`,
        );
    }

    public override onSubmit(): void {
        if (this.form().valid) {
            this.loading.set(true);
            const { username, password } = this.form().value;
            this.service
                .confirmAccount(this.user().id, { username, password } as IUser, this.params().type)
                .pipe(
                    catchError((error) => {
                        this.totast.error('app.common.messages.notUpdated');
                        return error;
                    }),
                )
                .subscribe(() => {
                    this.service.login(username, password, this.params().type).subscribe({
                        next: () => {
                            this.totast.success('app.common.messages.updated');
                            location.href = '/admin'; // Redirect to the admin page. It should be a route but the app need to load all resources.
                        },
                        error: () => {
                            console.error('Error logging in');
                        },
                    });
                });
        } else {
            this.totast.error('app.common.messages.invalidForm');
        }
    }

    public override loadUser(): void {
        this.service.findUser(this.params().token, this.params().type).subscribe({
            next: (user) => {
                const username = user.username || user.email;
                this.user.set(user);
                this.form().setControl(
                    'username',
                    new FormControl(username),
                );
            },
            error: () => {
                this.tokenExpired.set(true);
                console.error('Token expired or not found');
            },
        });
    }
}
