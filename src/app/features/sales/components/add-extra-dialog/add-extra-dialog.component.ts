import { CommonModule } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToastService } from '@core/services';
import { toCents } from '@core/utils';

const MAX_EXTRA_NAME_LENGTH = 80;

/** Lo que emite el diálogo al agregar — `SalesPosComponent` le asigna el `id` local de la línea del carrito. */
export interface AddedExtra {
    name: string;
    unitPriceCents: number;
    quantity: number;
}

/**
 * Venta Extra (nueva funcionalidad): agrega al carrito del POS un concepto
 * que NO es un `Product` registrado — chocolates, envoltura, servicios
 * ocasionales — sin código de barras ni inventario. El Extra nace aquí
 * mismo, al vender: no hay colección `extras` ni catálogo persistente, vive
 * solo como snapshot dentro de la venta (`functions/src/sales.ts`,
 * `kind: 'EXTRA'`).
 *
 * Validación mínima a propósito (prompt §8): no hay edición de nombre/precio
 * una vez agregado — si el vendedor se equivoca, quita la línea del carrito
 * y la vuelve a agregar. `createSale` revalida todo server-side (nunca
 * confía en lo que este diálogo ya validó).
 */
@Component({
    selector: 'app-add-extra-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        DialogModule,
        ButtonModule,
        InputTextModule,
        InputNumberModule,
        TranslateModule,
    ],
    templateUrl: './add-extra-dialog.component.html',
})
export class AddExtraDialogComponent {
    private readonly toast = inject(ToastService);

    visible = input.required<boolean>();
    visibleChange = output<boolean>();
    added = output<AddedExtra>();

    name = signal('');
    priceBs = signal<number | null>(null);
    quantity = signal<number | null>(1);

    readonly nameMaxLength = MAX_EXTRA_NAME_LENGTH;

    close(): void {
        this.visibleChange.emit(false);
        this.resetForm();
    }

    private resetForm(): void {
        this.name.set('');
        this.priceBs.set(null);
        this.quantity.set(1);
    }

    submit(): void {
        const name = this.name().trim();
        if (!name) {
            this.toast.error('app.sales.extra.messages.nameRequired');
            return;
        }
        const priceBs = this.priceBs();
        if (!priceBs || priceBs <= 0) {
            this.toast.error('app.sales.extra.messages.priceRequired');
            return;
        }
        const quantity = this.quantity();
        if (!quantity || !Number.isInteger(quantity) || quantity < 1) {
            this.toast.error('app.sales.extra.messages.quantityRequired');
            return;
        }

        this.added.emit({ name, unitPriceCents: toCents(priceBs), quantity });
        this.close();
    }
}
