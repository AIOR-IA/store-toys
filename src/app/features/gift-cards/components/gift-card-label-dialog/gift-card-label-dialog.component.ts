import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { BarcodeSvgComponent } from '@shared/components/ui';
import { LABEL_SIZE_MM } from '@shared/constants';
import { MoneyPipe } from '@shared/pipes';
import { printBarcodeLabel } from '@shared/utils';
import { ToastService } from '@core/services';

export interface GiftCardLabelTarget {
    code: string;
    amountCents: number;
}

/**
 * Impresión de la etiqueta de una Gift Card (ajuste posterior a la Fase 6,
 * prompt §13-§16): mismo mecanismo que `ProductLabelDialogComponent`
 * (`printBarcodeLabel`, `LABEL_SIZE_MM` compartidos — nunca una segunda
 * implementación completa de barcode), parametrizado sobre `{code,
 * amountCents}` en vez de sobre `Product` para poder usarse tanto con una
 * tarjeta ya registrada (`GiftCardDetailDialogComponent`) como con un código
 * recién generado que todavía no tiene un documento `GiftCard` completo en
 * el cliente (`GiftCardRegisterDialogComponent`, justo después de crearla).
 *
 * El código de una Gift Card NUNCA es un EAN/UPC real (lo imprime la
 * imprenta o lo genera el propio sistema, nunca un estándar comercial
 * externo — prompt §12), así que el formato es SIEMPRE `CODE128`: a
 * diferencia de Productos, no hace falta `detectBarcodeFormat`.
 *
 * AJUSTE POSTERIOR (identidad ≠ monto, prompt §33, §52): la etiqueta FÍSICA
 * ya NO imprime el monto — antes llevaba `secondaryText` con el importe
 * (`printBarcodeLabel` lo escribe literalmente en el papel), pero una
 * tarjeta reutilizable puede venderse por Bs 100 hoy y por Bs 500 el mes que
 * viene: fijarlo en el plástico quedaría mal en cuanto el monto cambie. El
 * monto sigue visible en ESTE diálogo (antes de imprimir, informativo
 * nada más) para que el admin confirme que está imprimiendo la tarjeta
 * correcta; solo el código (y su barcode) llegan al papel.
 */
@Component({
    selector: 'app-gift-card-label-dialog',
    standalone: true,
    imports: [CommonModule, DialogModule, ButtonModule, TranslateModule, BarcodeSvgComponent, MoneyPipe],
    templateUrl: './gift-card-label-dialog.component.html',
})
export class GiftCardLabelDialogComponent {
    private readonly toast = inject(ToastService);

    target = input<GiftCardLabelTarget | null>(null);
    closed = output<void>();

    readonly visible = computed(() => this.target() !== null);
    readonly labelSize = LABEL_SIZE_MM;

    close(): void {
        this.closed.emit();
    }

    async print(): Promise<void> {
        const target = this.target();
        if (!target) return;

        const ok = await printBarcodeLabel({
            code: target.code,
            primaryText: target.code,
        });
        if (!ok) {
            this.toast.error('app.common.errors.general');
        }
    }
}
