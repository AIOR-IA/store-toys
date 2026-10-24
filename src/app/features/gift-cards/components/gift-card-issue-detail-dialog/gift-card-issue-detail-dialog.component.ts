import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MoneyPipe } from '@shared/pipes';
import { SettingsService, ToastService } from '@core/services';
import { AppSettings } from '@core/models';
import { formatInStoreTimezone } from '@core/utils/date.util';
import { GiftCardReceiptService } from '../../gift-card-receipt.service';
import { GiftCardReceipt } from '../../gift-card.model';

/**
 * Detalle de UNA emisión/venta real de Gift Card, desde el Historial
 * (ajuste posterior, Recibo/Historial de Gift Cards). Espejo reducido de
 * `sale-detail-dialog`: solo lectura (ninguna acción de anulación — esto no
 * es una venta de `sales`, es `cancelGiftCard`/`replaceGiftCard`, que ya
 * viven en `gift-card-detail-dialog` y no se tocan aquí, prompt §25) más
 * `[Reimprimir recibo]`, que llama al MISMO `GiftCardReceiptService` que usa
 * "Imprimir recibo" justo después de vender — nunca dos recibos distintos
 * para el mismo ciclo.
 */
@Component({
    selector: 'app-gift-card-issue-detail-dialog',
    standalone: true,
    imports: [CommonModule, DialogModule, ButtonModule, TranslateModule, MoneyPipe],
    templateUrl: './gift-card-issue-detail-dialog.component.html',
})
export class GiftCardIssueDetailDialogComponent {
    private readonly receiptService = inject(GiftCardReceiptService);
    private readonly settingsService = inject(SettingsService);
    private readonly toast = inject(ToastService);

    receipt = input<GiftCardReceipt | null>(null);
    closed = output<void>();

    readonly visible = computed(() => this.receipt() !== null);
    printing = signal(false);

    private settings: AppSettings | null = null;

    constructor() {
        this.settingsService.getSettings().subscribe((settings) => (this.settings = settings));
    }

    close(): void {
        this.closed.emit();
    }

    formattedDate(receipt: GiftCardReceipt): string {
        return formatInStoreTimezone(receipt.activatedAt, this.settings?.timezone ?? 'America/La_Paz');
    }

    async print(): Promise<void> {
        const receipt = this.receipt();
        if (!receipt) return;

        this.printing.set(true);
        try {
            await this.receiptService.print(receipt);
        } catch {
            this.toast.error('app.common.errors.general');
        } finally {
            this.printing.set(false);
        }
    }
}
