import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TagModule } from 'primeng/tag';
import { MoneyPipe } from '@shared/pipes';
import { SettingsService, ToastService } from '@core/services';
import { formatInStoreTimezone } from '@core/utils/date.util';
import { AppSettings } from '@core/models';
import { SaleReceiptService } from '../../sale-receipt.service';
import { SalesService } from '../../sales.service';
import { Sale } from '../../sale.model';

/**
 * Detalle de una venta (plan §15.5, alcance Fase 4: "Detalle de venta").
 * También aloja la anulación (plan §15.4, solo admin) — es la única acción
 * de corrección posible, y nunca borra ni edita la venta original.
 */
@Component({
    selector: 'app-sale-detail-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        DialogModule,
        ButtonModule,
        TagModule,
        InputTextareaModule,
        TranslateModule,
        MoneyPipe,
    ],
    templateUrl: './sale-detail-dialog.component.html',
})
export class SaleDetailDialogComponent {
    private readonly salesService = inject(SalesService);
    private readonly receiptService = inject(SaleReceiptService);
    private readonly settingsService = inject(SettingsService);
    private readonly toast = inject(ToastService);

    sale = input<Sale | null>(null);
    isAdmin = input<boolean>(false);

    closed = output<void>();
    cancelled = output<void>();

    readonly visible = computed(() => this.sale() !== null);
    readonly canCancel = computed(
        () => this.isAdmin() && this.sale()?.status === 'completed',
    );

    showCancelForm = signal(false);
    cancelReason = signal('');
    cancelling = signal(false);
    printing = signal(false);

    private settings: AppSettings | null = null;

    constructor() {
        this.settingsService.getSettings().subscribe((settings) => (this.settings = settings));
    }

    close(): void {
        this.showCancelForm.set(false);
        this.cancelReason.set('');
        this.closed.emit();
    }

    formattedDate(sale: Sale): string {
        return formatInStoreTimezone(sale.createdAt, this.settings?.timezone ?? 'America/La_Paz');
    }

    async print(): Promise<void> {
        const sale = this.sale();
        if (!sale) return;

        this.printing.set(true);
        try {
            await this.receiptService.print(sale);
        } catch {
            this.toast.error('app.common.errors.general');
        } finally {
            this.printing.set(false);
        }
    }

    openCancelForm(): void {
        this.showCancelForm.set(true);
    }

    cancelCancelForm(): void {
        this.showCancelForm.set(false);
        this.cancelReason.set('');
    }

    confirmCancel(): void {
        const sale = this.sale();
        if (!sale) return;
        if (!this.cancelReason().trim()) {
            this.toast.error('app.sales.messages.cancelReasonRequired');
            return;
        }

        this.cancelling.set(true);
        this.salesService.cancelSale(sale.id, this.cancelReason().trim()).subscribe({
            next: () => {
                this.cancelling.set(false);
                this.showCancelForm.set(false);
                this.cancelReason.set('');
                this.toast.success('app.sales.messages.saleCancelled');
                this.cancelled.emit();
            },
            error: (error) => {
                this.cancelling.set(false);
                const message = (error as { message?: string })?.message;
                const code = (error as { code?: string })?.code;
                if (code?.startsWith('functions/') && message) {
                    this.toast.errorMessage(message);
                    return;
                }
                this.toast.error('app.common.errors.general');
            },
        });
    }
}
