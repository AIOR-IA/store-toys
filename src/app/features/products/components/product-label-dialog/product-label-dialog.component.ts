import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { BarcodeSvgComponent } from '@shared/components/ui';
import { LABEL_SIZE_MM } from '@shared/constants';
import { printBarcodeLabel } from '@shared/utils';
import { ToastService } from '@core/services';
import { Product } from '../../product.model';

/**
 * Impresión de una sola etiqueta (prompt §7, §8): abre una ventana nueva con
 * SOLO el contenido de la etiqueta — nada de sidebar, topbar, botones ni
 * formulario — y dispara `print()` ahí. Es más simple y más confiable que
 * pelear con CSS de impresión global contra el layout completo de la app
 * (sidebar/topbar encapsulados), y da control total sobre el tamaño físico
 * en mm (`@page { size: 50mm 30mm }`), sin depender de píxeles.
 *
 * El tamaño vive en `LABEL_SIZE_MM`: cambiarlo no toca esta lógica.
 */
@Component({
    selector: 'app-product-label-dialog',
    standalone: true,
    imports: [CommonModule, DialogModule, ButtonModule, TranslateModule, BarcodeSvgComponent],
    templateUrl: './product-label-dialog.component.html',
})
export class ProductLabelDialogComponent {
    private readonly toast = inject(ToastService);

    product = input<Product | null>(null);
    closed = output<void>();

    readonly visible = computed(() => this.product() !== null);
    readonly labelSize = LABEL_SIZE_MM;

    close(): void {
        this.closed.emit();
    }

    async print(): Promise<void> {
        const product = this.product();
        if (!product) return;

        const ok = await printBarcodeLabel({
            code: product.code,
            format: product.barcodeFormat,
            primaryText: product.code,
            secondaryText: product.name,
        });
        if (!ok) {
            this.toast.error('app.common.errors.general');
        }
    }
}
