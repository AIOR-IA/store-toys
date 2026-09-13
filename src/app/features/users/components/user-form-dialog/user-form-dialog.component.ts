import { CommonModule } from '@angular/common';
import {
    Component,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import {
    FormBuilder,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, concat } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import {
    AddressValidator,
    CiValidator,
    PhoneValidator,
    onlyLettersValidator,
    trimmedRequiredValidator,
} from '@shared/form-validators';
import { AppUser, RoleUser, SessionService } from '@core/session';
import { ToastService } from '@core/services';
import { UsersService } from '../../users.service';

interface RoleOption {
    label: string;
    value: RoleUser;
}

/**
 * Alta y edición de usuarios (plan §7, Fase 2).
 *
 * Un mismo formulario para crear y editar: `user()` a `null` es alta (pide
 * contraseña inicial), con valor es edición (sin contraseña — eso es
 * "Cambiar contraseña" del propio usuario, Fase 2 §11, no de este módulo).
 *
 * El correo se trata aparte del resto del perfil: si cambió, primero se
 * llama a `updateUserAuth` (Function) y **solo si eso tiene éxito** se
 * guarda el resto de los campos con una escritura directa a Firestore
 * (Rule-protegida). Nunca se usa `createUserWithEmailAndPassword` desde el
 * cliente — reemplazaría la sesión del admin (plan §7.2).
 */
@Component({
    selector: 'app-user-form-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        DialogModule,
        ButtonModule,
        InputTextModule,
        PasswordModule,
        DropdownModule,
        TranslateModule,
    ],
    templateUrl: './user-form-dialog.component.html',
})
export class UserFormDialogComponent {
    private readonly formBuilder = inject(FormBuilder);
    private readonly usersService = inject(UsersService);
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);
    private readonly sessionService = inject(SessionService);

    visible = input.required<boolean>();
    user = input<AppUser | null>(null);

    visibleChange = output<boolean>();
    saved = output<void>();

    readonly isEdit = computed(() => this.user() !== null);

    /**
     * Un admin no puede cambiar su propio rol (Rule + Function lo impiden
     * igual, pero deshabilitar el control evita el viaje de red inútil y dice
     * por qué está bloqueado).
     */
    readonly isEditingSelf = computed(() => {
        const target = this.user();
        const session = this.sessionService.session();
        return (
            !!target &&
            session.status === 'active' &&
            session.uid === target.uid
        );
    });

    readonly roleOptions: RoleOption[] = [
        { label: 'app.users.roles.admin', value: 'admin' },
        { label: 'app.users.roles.user', value: 'user' },
    ];

    saving = signal(false);
    form: FormGroup = this.buildForm(null);

    constructor() {
        // Reconstruye el formulario cada vez que el diálogo se abre: así
        // siempre parte de los datos frescos del usuario (o vacío, en alta)
        // y no arrastra lo que alguien haya escrito la vez anterior.
        effect(() => {
            if (this.visible()) {
                this.form = this.buildForm(this.user());
                if (this.isEditingSelf()) {
                    this.form.get('role')?.disable();
                }
            }
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.saving.set(true);
        const value = this.form.getRawValue();
        const target = this.user();

        if (!target) {
            this.usersService
                .createUser({
                    firstName: value.firstName,
                    lastName: value.lastName,
                    ci: value.ci,
                    email: value.email,
                    password: value.password,
                    role: value.role,
                    phoneNumber: value.phoneNumber || undefined,
                    address: value.address || undefined,
                })
                .subscribe({
                    next: () => this.onSuccess('app.common.messages.created'),
                    error: (error) => this.onError(error),
                });
            return;
        }

        // Cada campo privilegiado que cambió es su propia llamada a una
        // Function, encadenadas en secuencia: si una falla, las siguientes no
        // se ejecutan y el perfil no queda a medias entre Auth y Firestore.
        const steps: Observable<unknown>[] = [];

        if (value.email !== target.email) {
            steps.push(this.usersService.updateEmail(target.uid, value.email));
        }
        if (value.role !== target.role) {
            steps.push(this.usersService.setRole(target.uid, value.role));
        }
        steps.push(
            this.usersService.updateProfile(target.uid, {
                firstName: value.firstName,
                lastName: value.lastName,
                ci: value.ci,
                phoneNumber: value.phoneNumber || undefined,
                address: value.address || undefined,
            }),
        );

        concat(...steps).subscribe({
            complete: () => this.onSuccess('app.common.messages.updated'),
            error: (error) => this.onError(error),
        });
    }

    close(): void {
        this.visibleChange.emit(false);
    }

    private buildForm(user: AppUser | null): FormGroup {
        return this.formBuilder.group({
            firstName: [
                user?.firstName ?? null,
                [
                    Validators.required,
                    trimmedRequiredValidator,
                    onlyLettersValidator,
                    Validators.maxLength(60),
                ],
            ],
            lastName: [
                user?.lastName ?? null,
                [
                    Validators.required,
                    trimmedRequiredValidator,
                    onlyLettersValidator,
                    Validators.maxLength(60),
                ],
            ],
            ci: [user?.ci ?? null, [Validators.required, CiValidator]],
            email: [
                user?.email ?? null,
                [Validators.required, Validators.email],
            ],
            phoneNumber: [user?.phoneNumber ?? null, [PhoneValidator]],
            address: [user?.address ?? null, [AddressValidator]],
            role: [user?.role ?? 'user', [Validators.required]],
            password: user
                ? [null]
                : [
                      null,
                      [
                          Validators.required,
                          Validators.minLength(8),
                          Validators.maxLength(40),
                      ],
                  ],
        });
    }

    private onSuccess(messageKey: string): void {
        this.saving.set(false);
        this.toast.success(messageKey);
        this.saved.emit();
        this.close();
    }

    /**
     * Los errores de estas Functions ya vienen redactados en español por
     * nosotros mismos (`functions/src/users.ts`) — no es el texto crudo de
     * Firebase que CLAUDE.md prohíbe mostrar, es nuestro propio mensaje.
     * Solo se recurre a una clave genérica si la llamada nunca llegó a la
     * Function (por ejemplo, sin conexión).
     */
    private onError(error: unknown): void {
        this.saving.set(false);
        const message = (error as { message?: string })?.message;
        const code = (error as { code?: string })?.code;

        if (code?.startsWith('functions/') && message) {
            this.toast.errorMessage(message);
            return;
        }

        this.toast.error('app.common.errors.general');
    }
}
