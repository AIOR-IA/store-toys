import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TagModule } from 'primeng/tag';
import { MoneyPipe } from '@shared/pipes';
import { ImageCompressorService, SettingsService, ToastService } from '@core/services';
import { formatInStoreTimezone } from '@core/utils/date.util';
import { AppSettings } from '@core/models';
import { SaleReceiptService } from '../../sale-receipt.service';
import { SalesService } from '../../sales.service';
import { Payment, Sale } from '../../sale.model';

interface IndexedPayment extends Payment {
    index: number;
}

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
    private readonly imageCompressor = inject(ImageCompressorService);
    private readonly toast = inject(ToastService);

    sale = input<Sale | null>(null);
    isAdmin = input<boolean>(false);

    closed = output<void>();
    cancelled = output<void>();
    /** Se emite cuando un voucher se adjunta (Fase 5): el padre reemplaza su copia de la venta. */
    saleUpdated = output<Sale>();

    readonly visible = computed(() => this.sale() !== null);
    readonly canCancel = computed(
        () => this.isAdmin() && this.sale()?.status === 'completed',
    );

    /**
     * Un voucher solo se puede adjuntar sobre una venta `completed` (prompt
     * §19): la opción conservadora, ya que el plan no define política para
     * ventas anuladas — una anulada solo permite VER el voucher histórico.
     */
    readonly canAttachVoucher = computed(() => this.sale()?.status === 'completed');
    readonly qrPayments = computed<IndexedPayment[]>(() => {
        const sale = this.sale();
        if (!sale) return [];
        return sale.payments
            .map((payment, index) => ({ ...payment, index }))
            .filter((payment) => payment.method === 'qr');
    });

    /**
     * TODOS los pagos de la venta, genérico (corrección de presentación,
     * Fase 6): antes solo se mostraba un resumen de métodos como tags
     * (`[Gift Card] [Efectivo]`) sin sus montos — un pago mixto no dejaba
     * claro cuánto entró por cada forma de pago. Nunca relee el estado ACTUAL
     * de `giftCards` (plan §25, prompt §24): la misma tarjeta puede estar en
     * un ciclo completamente distinto para cuando se reimprime — todo sale
     * del snapshot que ya guardó `createSale` en el propio pago.
     */
    readonly paymentRows = computed<IndexedPayment[]>(() => {
        const sale = this.sale();
        if (!sale) return [];
        return sale.payments.map((payment, index) => ({ ...payment, index }));
    });

    showCancelForm = signal(false);
    cancelReason = signal('');
    cancelling = signal(false);
    printing = signal(false);

    attachTargetIndex = signal<number | null>(null);
    attachingIndex = signal<number | null>(null);
    compressingVoucher = signal(false);
    voucherViewerUrl = signal<string | null>(null);

    private settings: AppSettings | null = null;

    constructor() {
        this.settingsService.getSettings().subscribe((settings) => (this.settings = settings));
    }

    close(): void {
        this.showCancelForm.set(false);
        this.cancelReason.set('');
        this.voucherViewerUrl.set(null);
        this.closed.emit();
    }

    openFilePicker(index: number, fileInput: HTMLInputElement): void {
        this.attachTargetIndex.set(index);
        fileInput.click();
    }

    async onVoucherFileSelected(event: Event): Promise<void> {
        const fileInput = event.target as HTMLInputElement;
        const file = fileInput.files?.[0];
        const index = this.attachTargetIndex();
        const sale = this.sale();
        if (!file || index === null || !sale) return;

        this.compressingVoucher.set(true);
        let blob: Blob;
        try {
            blob = await this.imageCompressor.compressVoucherImage(file);
        } catch {
            this.compressingVoucher.set(false);
            fileInput.value = '';
            this.toast.error('app.common.errors.general');
            return;
        }
        this.compressingVoucher.set(false);
        fileInput.value = '';

        this.attachingIndex.set(index);
        this.salesService.attachVoucherWithUpload(sale.id, index, blob).subscribe({
            next: () => this.refreshAfterAttach(sale.id),
            error: (error) => {
                this.attachingIndex.set(null);
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

    private refreshAfterAttach(saleId: string): void {
        this.salesService.getSale(saleId).subscribe({
            next: (sale) => {
                this.attachingIndex.set(null);
                if (sale) {
                    this.toast.success('app.sales.voucher.attachSuccess');
                    this.saleUpdated.emit(sale);
                }
            },
            error: () => {
                this.attachingIndex.set(null);
                this.toast.error('app.common.errors.general');
            },
        });
    }

    viewVoucher(url: string): void {
        this.voucherViewerUrl.set(url);
    }

    closeVoucherViewer(): void {
        this.voucherViewerUrl.set(null);
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
