import { CommonModule } from '@angular/common';
import {
    Component,
    ElementRef,
    ViewChild,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import {
    AbstractControl,
    FormBuilder,
    FormGroup,
    ValidationErrors,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { trimmedRequiredValidator } from '@shared/form-validators';
import { SessionService } from '@core/session';
import { ImageCompressorService, ToastService } from '@core/services';
import { toCents, fromCents } from '@core/utils';
import {
    ProductCodePickerComponent,
    ResolvedCode,
} from '../product-code-picker/product-code-picker.component';
import { ProductsService, ProductsServiceError } from '../../products.service';
import { Product } from '../../product.model';

function integerValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;
    return Number.isInteger(value) ? null : { onlyNumbers: true };
}

/**
 * Alta y edición de productos (plan §13, Fase 3).
 *
 * Un mismo formulario para las dos operaciones: `product()` a `null` es
 * alta, con valor es edición. El código NO se edita aquí — cambiarlo es una
 * acción de admin aparte (`ProductChangeCodeDialogComponent`, prompt §10)
 * porque implica reservar un código nuevo y retirar el índice anterior, algo
 * distinto de una edición de campo.
 *
 * Tras crear un producto, el diálogo se vacía y sigue abierto con el foco en
 * el nombre en vez de cerrarse (plan §13.3: la persona que carga el catálogo
 * recorre los estantes con el celular y crea uno tras otro — cerrar y volver
 * a abrir el diálogo por cada juguete multiplicaría el esfuerzo por mil).
 */
@Component({
    selector: 'app-product-form-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        DialogModule,
        ButtonModule,
        InputTextModule,
        InputTextareaModule,
        InputNumberModule,
        TranslateModule,
        ProductCodePickerComponent,
    ],
    templateUrl: './product-form-dialog.component.html',
})
export class ProductFormDialogComponent {
    private readonly formBuilder = inject(FormBuilder);
    private readonly productsService = inject(ProductsService);
    private readonly imageCompressor = inject(ImageCompressorService);
    private readonly toast = inject(ToastService);
    private readonly sessionService = inject(SessionService);

    visible = input.required<boolean>();
    product = input<Product | null>(null);

    visibleChange = output<boolean>();
    saved = output<void>();

    @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;
    @ViewChild(ProductCodePickerComponent) codePicker?: ProductCodePickerComponent;

    readonly isEdit = computed(() => this.product() !== null);
    readonly isAdmin = computed(() => {
        const session = this.sessionService.session();
        return session.status === 'active' && session.role === 'admin';
    });

    saving = signal(false);
    form: FormGroup = this.buildForm(null);

    resolvedCode = signal<ResolvedCode | null>(null);
    imagePreviewUrl = signal<string | null>(null);
    pendingImage = signal<Blob | null>(null);
    compressingImage = signal(false);

    constructor() {
        // Reconstruye el formulario cada vez que el diálogo se abre para
        // ALTA (mismo patrón que Usuarios): en edición no se reconstruye
        // sobre la marcha para no perder lo que "Guardar y cargar otro"
        // acaba de vaciar mientras el diálogo sigue abierto.
        //
        // El efecto solo LEE `visible`/`product`/`isAdmin`. La escritura de
        // señales va dentro de `untracked()`, no con `allowSignalWrites`:
        // reproducido en vivo, un efecto con `allowSignalWrites` que escribe
        // una señal cuyo cambio dispara un evento de un componente hijo
        // (`resolvedChange` de `ProductCodePickerComponent`, emitido al
        // terminar `generateInternalCode()`) puede volver a marcarse sucio y
        // reejecutarse una segunda vez con los MISMOS valores de entrada —
        // vaciando el formulario a mitad de la carga. `untracked()` suspende
        // el seguimiento de dependencias mientras escribe, así que esa
        // escritura nunca vuelve a "engancharse" al propio efecto.
        effect(() => {
            const visible = this.visible();
            const isEdit = this.isEdit();
            const isAdmin = this.isAdmin();
            const product = this.product();

            untracked(() => {
                if (visible && !isEdit) {
                    this.resetForCreate();
                } else if (visible && isEdit) {
                    this.form = this.buildForm(product);
                    this.imagePreviewUrl.set(product?.imageUrl ?? null);
                    this.pendingImage.set(null);
                    if (!isAdmin) {
                        this.form.get('priceBs')?.disable();
                    }
                }
            });
        });
    }

    async onImageSelected(event: Event): Promise<void> {
        const fileInput = event.target as HTMLInputElement;
        const file = fileInput.files?.[0];
        if (!file) return;

        this.compressingImage.set(true);
        try {
            const blob = await this.imageCompressor.compressProductImage(file);
            this.pendingImage.set(blob);
            this.imagePreviewUrl.set(URL.createObjectURL(blob));
        } catch {
            this.toast.error('app.common.errors.general');
        } finally {
            this.compressingImage.set(false);
            fileInput.value = '';
        }
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const target = this.product();
        if (!target && !this.pendingImage()) {
            this.toast.error('app.products.messages.imageRequired');
            return;
        }
        if (!target && !this.resolvedCode()) {
            this.toast.error('app.products.messages.codeRequired');
            return;
        }

        this.saving.set(true);
        const value = this.form.getRawValue();

        if (!target) {
            const code = this.resolvedCode() as ResolvedCode;
            this.productsService
                .createProduct(
                    {
                        name: value.name,
                        description: value.description || undefined,
                        priceCents: toCents(value.priceBs),
                        stock: value.stock,
                        code: code.code,
                        codeSource: code.codeSource,
                    },
                    this.pendingImage() as Blob,
                )
                .subscribe({
                    next: () => this.onCreateSuccess(),
                    error: (error) => this.onError(error),
                });
            return;
        }

        this.updateExisting(target);
    }

    close(): void {
        this.visibleChange.emit(false);
    }

    private updateExisting(target: Product): void {
        const value = this.form.getRawValue();

        const applyUpdate = (imageUrl?: string, imagePath?: string) => {
            this.productsService
                .updateProduct(target.id, {
                    name: value.name,
                    description: value.description || undefined,
                    stock: value.stock,
                    ...(this.isAdmin()
                        ? { priceCents: toCents(value.priceBs) }
                        : {}),
                    ...(imageUrl ? { imageUrl, imagePath } : {}),
                })
                .subscribe({
                    next: () => this.onUpdateSuccess(),
                    error: (error) => this.onError(error),
                });
        };

        const newImage = this.pendingImage();
        if (newImage) {
            this.productsService
                .replaceImage(target.id, newImage, target.imagePath)
                .then((result) => applyUpdate(result.imageUrl, result.imagePath))
                .catch(() => {
                    this.saving.set(false);
                    this.toast.error('app.common.errors.general');
                });
            return;
        }

        applyUpdate();
    }

    private onCreateSuccess(): void {
        this.saving.set(false);
        this.toast.success('app.common.messages.created');
        this.saved.emit();
        this.resetForCreate();
        this.nameInput?.nativeElement.focus();
    }

    private onUpdateSuccess(): void {
        this.saving.set(false);
        this.toast.success('app.common.messages.updated');
        this.saved.emit();
        this.close();
    }

    private onError(error: unknown): void {
        this.saving.set(false);
        if (error instanceof ProductsServiceError) {
            this.toast.error(
                error.code === 'duplicate-code'
                    ? 'app.products.messages.duplicateCode'
                    : 'app.products.messages.counterNotSeeded',
            );
            return;
        }
        this.toast.error('app.common.errors.general');
    }

    private resetForCreate(): void {
        this.form = this.buildForm(null);
        this.resolvedCode.set(null);
        this.imagePreviewUrl.set(null);
        this.pendingImage.set(null);
        this.codePicker?.reset();
    }

    private buildForm(product: Product | null): FormGroup {
        return this.formBuilder.group({
            name: [
                product?.name ?? null,
                [
                    Validators.required,
                    trimmedRequiredValidator,
                    Validators.maxLength(80),
                ],
            ],
            description: [product?.description ?? null, [Validators.maxLength(300)]],
            priceBs: [
                product ? fromCents(product.priceCents) : null,
                [Validators.required, Validators.min(0.01)],
            ],
            stock: [
                product?.stock ?? 0,
                [Validators.required, Validators.min(0), integerValidator],
            ],
        });
    }
}
