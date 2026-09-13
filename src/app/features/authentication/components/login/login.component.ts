import { Component, OnInit, WritableSignal, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    FormBuilder,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FirebaseError } from '@angular/fire/app';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessagesModule } from 'primeng/messages';
import { PasswordModule } from 'primeng/password';
import { TranslateModule } from '@ngx-translate/core';
import { SessionService } from '@core/session';

/**
 * Pantalla de login.
 *
 * El diseño (HTML + SCSS) está APROBADO y no se rediseña: el HTML solo
 * cambió para reemplazar textos hardcodeados por el pipe `translate` y para
 * activar dos validaciones que ya estaban dibujadas en la plantilla pero
 * nunca se ejecutaban (`maxLength(20)`, y el formato de correo).
 *
 * FASE 1: conecta el formulario con `signInWithEmailAndPassword` a través de
 * `SessionService.login()` (docs/architecture/mi-pimpollito-plan.md §6.5).
 * `onSubmit()` no decide nada por sí mismo: espera a que la cadena de sesión
 * resuelva `active` o `rejected` para este intento y reacciona a eso, nunca a
 * la respuesta cruda de Firebase Auth.
 */
@Component({
    selector: 'app-login',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        ButtonModule,
        InputTextModule,
        MessagesModule,
        PasswordModule,
        TranslateModule,
    ],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
    private readonly formBuilder = inject(FormBuilder);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly sessionService = inject(SessionService);

    protected loading: WritableSignal<boolean> = signal(false);

    errorLogin = signal(false);
    /** Clave de `es.json` a mostrar dentro del bloque de error del formulario. */
    errorMessageKey = signal('app.common.messages.errorLogin');
    loginForm!: FormGroup;

    ngOnInit(): void {
        this.loginForm = this.formBuilder.group({
            // Sin maxLength: es un correo, no el "usuario" corto del diseño
            // heredado — un email real supera los 20 caracteres con facilidad
            // (p. ej. "administracion@mipimpollito.com").
            username: [null, [Validators.required, Validators.email]],
            password: [
                null,
                [
                    Validators.required,
                    Validators.minLength(6), // mínimo real de Firebase Auth
                    Validators.maxLength(20),
                ],
            ],
        });

        // El authGuard manda aquí con ?denied=<reason> cuando alguien con
        // sesión rechazada intenta entrar directo a una ruta protegida.
        const denied = this.route.snapshot.queryParamMap.get('denied');
        if (denied === 'inactive') {
            this.showError('app.auth.errors.inactive');
        } else if (denied === 'no-profile') {
            this.showError('app.auth.errors.noProfile');
        }
    }

    onSubmit(): void {
        if (this.loginForm.invalid) {
            this.loginForm.markAllAsTouched();
            return;
        }

        this.loading.set(true);
        this.errorLogin.set(false);
        const { username: email, password } = this.loginForm.value;

        this.sessionService.login(email, password).subscribe({
            next: (session) => {
                this.loading.set(false);

                if (session.status === 'active') {
                    this.router.navigateByUrl('/');
                    return;
                }

                // rejected: la cuenta de Auth es válida pero no está autorizada.
                this.showError(
                    session.reason === 'inactive'
                        ? 'app.auth.errors.inactive'
                        : 'app.auth.errors.noProfile',
                );
                // No se deja una sesión de Firebase Auth "a medias": si no
                // está autorizado, tampoco queda conectado (plan §6.5).
                this.sessionService.logout().subscribe();
            },
            error: (err: FirebaseError) => {
                this.loading.set(false);
                this.showError(this.mapAuthErrorKey(err?.code));
            },
        });
    }

    get form(): any {
        return this.loginForm.controls;
    }

    private showError(key: string): void {
        this.errorMessageKey.set(key);
        this.errorLogin.set(true);
    }

    /**
     * Mapa de errores de Firebase Auth → clave de `es.json` (plan §6.5).
     * Nunca se muestra el texto crudo de Firebase al usuario.
     *
     * `invalid-credential` / `wrong-password` / `user-not-found` comparten a
     * propósito el mismo mensaje genérico: distinguirlos revelaría qué
     * correos están registrados.
     */
    private mapAuthErrorKey(code: string | undefined): string {
        switch (code) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
            case 'auth/user-not-found':
                return 'app.common.messages.errorLogin';
            case 'auth/too-many-requests':
                return 'app.auth.errors.tooManyRequests';
            case 'auth/network-request-failed':
                return 'app.auth.errors.network';
            case 'auth/user-disabled':
                return 'app.auth.errors.inactive';
            default:
                return 'app.common.errors.general';
        }
    }
}
