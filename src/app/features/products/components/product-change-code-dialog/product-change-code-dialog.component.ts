import { CommonModule } from '@angular/common';
import {
    Component,
    ViewChild,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ToastService } from '@core/services';
import {
    ProductCodePickerComponent,
    ResolvedCode,
} from '../product-code-picker/product-code-picker.component';
import { ProductsService, ProductsServiceError } from '../../products.service';
import { Product } from '../../product.model';

/**
 * Cambio de código (admin-only por Rules, prompt §10): reserva un código
 * nuevo, retira el índice anterior de `barcodes` y actualiza el producto, en
 * una sola transacción (`ProductsService.changeCode`). Separado del
 * formulario de edición porque no es una edición de campo — es una
 * operación con su propia garantía de unicidad.
 */
@Component({
    selector: 'app-product-change-code-dialog',
    standalone: true,
    imports: [CommonModule, DialogModule, ButtonModule, TranslateModule, ProductCodePickerComponent],
    templateUrl: './product-change-code-dialog.component.html',
})
export class ProductChangeCodeDialogComponent {
    private readonly productsService = inject(ProductsService);
    private readonly toast = inject(ToastService);

    product = input<Product | null>(null);
    closed = output<void>();
    saved = output<void>();

    @ViewChild(ProductCodePickerComponent) codePicker?: ProductCodePickerComponent;

    readonly visible = computed(() => this.product() !== null);

    saving = signal(false);
    resolvedCode = signal<ResolvedCode | null>(null);

    constructor() {
        // `untracked()`, no `allowSignalWrites` — ver el comentario extenso
        // en `ProductFormDialogComponent`: `codePicker.reset()` emite un
        // output (`resolvedChange`) que puede volver a marcar sucio a un
        // efecto con `allowSignalWrites`, reejecutándolo con los mismos
        // valores de entrada. `untracked()` no tiene ese riesgo.
        effect(() => {
            const visible = this.visible();
            untracked(() => {
                if (visible) {
                    this.resolvedCode.set(null);
                    this.codePicker?.reset();
                }
            });
        });
    }

    submit(): void {
        const target = this.product();
        const resolved = this.resolvedCode();
        if (!target || !resolved) return;

        this.saving.set(true);
        this.productsService
            .changeCode(target.id, resolved.code, resolved.codeSource)
            .subscribe({
                next: () => {
                    this.saving.set(false);
                    this.toast.success('app.products.messages.codeChanged');
                    this.saved.emit();
                    this.close();
                },
                error: (error) => {
                    this.saving.set(false);
                    if (
                        error instanceof ProductsServiceError &&
                        error.code === 'duplicate-code'
                    ) {
                        this.toast.error('app.products.messages.duplicateCode');
                    } else {
                        this.toast.error('app.common.errors.general');
                    }
                },
            });
    }

    close(): void {
        this.closed.emit();
    }
}
