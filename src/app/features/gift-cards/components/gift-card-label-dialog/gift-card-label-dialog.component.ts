import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { BarcodeSvgComponent } from '@shared/components/ui';
import { LABEL_SIZE_MM } from '@shared/constants';
import { MoneyPipe } from '@shared/pipes';
import { printBarcodeLabel } from '@shared/utils';
import { ToastService } from '@core/services';
import { fromCents } from '@core/utils';

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
 */
@Component({
    selector: 'app-gift-card-label-dialog',
    standalone: true,
    imports: [CommonModule, DialogModule, ButtonModule, TranslateModule, BarcodeSvgComponent, MoneyPipe],
    templateUrl: './gift-card-label-dialog.component.html',
})
export class GiftCardLabelDialogComponent {
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);
    private readonly currencyPipe = inject(CurrencyPipe);

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

        // Mismo formato que `MoneyPipe` (plan §17.1), pero sin instanciarlo
        // directamente: un `@Pipe` sin `providedIn` solo se resuelve vía DI
        // cuando Angular lo instancia para un binding de plantilla — aquí
        // hace falta el texto ANTES de abrir la ventana de impresión, así
        // que se replica con el mismo `CurrencyPipe` que `MoneyPipe` usa por
        // debajo (provisto en la raíz, `app.config.ts`).
        const amountLabel = this.translate.instant('app.giftCards.labels.amountText', {
            amount: this.currencyPipe.transform(fromCents(target.amountCents), 'BOB', 'Bs', '1.2-2') ?? '',
        });

        const ok = await printBarcodeLabel({
            code: target.code,
            primaryText: target.code,
            secondaryText: amountLabel,
        });
        if (!ok) {
            this.toast.error('app.common.errors.general');
        }
    }
}
