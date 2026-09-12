import { Component, OnInit, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    FormBuilder,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessagesModule } from 'primeng/messages';
import { PasswordModule } from 'primeng/password';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Pantalla de login.
 *
 * El diseño (HTML + SCSS) está APROBADO y no se rediseña.
 *
 * FASE 0A: se eliminó toda la lógica REST/JWT heredada de SAHTOSO (login contra
 * API, `context` de AGENT_OFFICER/REPRESENTANT, flujo de activar cuenta,
 * redirecciones con `location.href` y el validador usuario-o-email).
 * El formulario queda armado y validando, pero `onSubmit()` todavía no
 * autentica: la conexión con Firebase Authentication se hace en la FASE 1
 * (docs/architecture/mi-pimpollito-plan.md §6.5).
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
    protected loading: WritableSignal<boolean>;

    errorLogin = signal(false);
    expired = signal<boolean>(false);
    loginForm!: FormGroup;

    constructor(
        private readonly formBuilder: FormBuilder,
        private readonly route: ActivatedRoute,
    ) {
        this.loading = signal(false);
    }

    ngOnInit(): void {
        this.loginForm = this.formBuilder.group({
            username: [null, [Validators.required]],
            password: [null, [Validators.required, Validators.minLength(8)]],
        });

        this.route.queryParams.subscribe((params) => {
            this.expired.set(params['expired'] === 'true');
        });
    }

    onSubmit(): void {
        if (this.loginForm.invalid) {
            this.loginForm.markAllAsTouched();
            return;
        }

        // FASE 1: signInWithEmailAndPassword() + la cadena de sesión.
        this.errorLogin.set(false);
    }

    get form(): any {
        return this.loginForm.controls;
    }
}
