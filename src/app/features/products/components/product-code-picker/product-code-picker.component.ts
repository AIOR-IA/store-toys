import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { BarcodeSvgComponent } from '@shared/components/ui';
import { ToastService } from '@core/services';
import { BarcodeFormat, CodeSource, detectBarcodeFormat, normalizeCode } from '@core/utils';
import { ProductsService, ProductsServiceError } from '../../products.service';

export interface ResolvedCode {
    code: string;
    codeSource: CodeSource;
}

/**
 * Selector de código de un producto (prompt §4, §5, §6): o el vendedor
 * escribe/escanea el código de fábrica, o pide uno interno generado por
 * `counters/internalCode` (plan §14.2). Se reutiliza igual en el alta y en
 * "Cambiar código" (admin) — la única diferencia entre ambos casos la decide
 * quien lo usa, no este componente.
 *
 * No usa un `FormGroup` propio a propósito: expone su resultado ya resuelto
 * (`resolvedChange`) para que el formulario contenedor lo trate como un
 * campo más, sin anidar formularios reactivos.
 */
@Component({
    selector: 'app-product-code-picker',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        InputTextModule,
        TranslateModule,
        BarcodeSvgComponent,
    ],
    templateUrl: './product-code-picker.component.html',
})
export class ProductCodePickerComponent {
    private readonly productsService = inject(ProductsService);
    private readonly toast = inject(ToastService);

    disabled = input<boolean>(false);
    resolvedChange = output<ResolvedCode | null>();

    mode = signal<CodeSource | null>(null);
    manufacturerCode = signal('');
    generatedCode = signal<string | null>(null);
    generating = signal(false);

    readonly resolved = computed<ResolvedCode | null>(() => {
        if (this.mode() === 'manufacturer') {
            const code = normalizeCode(this.manufacturerCode());
            return code ? { code, codeSource: 'manufacturer' } : null;
        }
        if (this.mode() === 'internal' && this.generatedCode()) {
            return { code: this.generatedCode() as string, codeSource: 'internal' };
        }
        return null;
    });

    readonly previewFormat = computed<BarcodeFormat>(() =>
        this.resolved() ? detectBarcodeFormat(this.resolved()!.code) : 'CODE128',
    );

    selectManufacturer(): void {
        this.mode.set('manufacturer');
        this.generatedCode.set(null);
        this.emit();
    }

    selectInternal(): void {
        this.mode.set('internal');
        this.manufacturerCode.set('');
        this.emit();
    }

    onManufacturerCodeInput(value: string): void {
        this.manufacturerCode.set(value);
        this.emit();
    }

    generateCode(): void {
        this.generating.set(true);
        this.productsService.generateInternalCode().subscribe({
            next: (code) => {
                this.generatedCode.set(code);
                this.generating.set(false);
                this.emit();
            },
            error: (error) => {
                this.generating.set(false);
                if (
                    error instanceof ProductsServiceError &&
                    error.code === 'counter-not-seeded'
                ) {
                    this.toast.error('app.products.messages.counterNotSeeded');
                } else {
                    this.toast.error('app.common.errors.general');
                }
            },
        });
    }

    /** Vuelve al estado inicial — se llama cuando el diálogo contenedor se reabre. */
    reset(): void {
        this.mode.set(null);
        this.manufacturerCode.set('');
        this.generatedCode.set(null);
        this.generating.set(false);
        this.emit();
    }

    private emit(): void {
        this.resolvedChange.emit(this.resolved());
    }
}
