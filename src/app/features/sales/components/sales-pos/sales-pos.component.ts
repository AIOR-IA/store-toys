import { CommonModule } from '@angular/common';
import {
    AfterViewInit,
    Component,
    ElementRef,
    HostListener,
    ViewChild,
    computed,
    inject,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { MoneyPipe } from '@shared/pipes';
import { ImageCompressorService, ToastService } from '@core/services';
import { toCents } from '@core/utils';
import { GiftCard, GiftCardIssuePaymentMethod } from '../../../gift-cards/gift-card.model';
import { GiftCardsService } from '../../../gift-cards/gift-cards.service';
import { Product } from '../../../products/product.model';
import { ProductsService } from '../../../products/products.service';
import { SaleReceiptService } from '../../sale-receipt.service';
import { CreateSalePaymentInput, SalesService } from '../../sales.service';
import { PaymentMethod, Sale, SaleCartLine } from '../../sale.model';

type PosPaymentMethod = PaymentMethod;
/** Segundo pago para cubrir la diferencia cuando la compra supera el valor de la gift card. */
type GiftCardDifferenceMethod = Extract<PaymentMethod, 'cash' | 'qr'>;

/**
 * Punto de venta (plan §15.5, prompt §16): un solo puesto, pensado para
 * teclado + lector HID (G1). Plan A (escáner) y Plan B (manual) recorren
 * EXACTAMENTE el mismo `<form (ngSubmit)>` — el lector escribe el código
 * como si fuera un teclado y termina con Enter, que es justo lo que dispara
 * `ngSubmit` en un formulario de un solo input (prompt §2, §3, §32).
 *
 * El servidor —no esta pantalla— es quien recalcula precios, valida stock y
 * decide el total final (plan §15.3, §30): el carrito solo envía
 * `productId`/`quantity` por línea, nunca un precio.
 */
@Component({
    selector: 'app-sales-pos',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterLink,
        ButtonModule,
        InputTextModule,
        InputNumberModule,
        RadioButtonModule,
        TableModule,
        TooltipModule,
        TranslateModule,
        MoneyPipe,
    ],
    templateUrl: './sales-pos.component.html',
})
export class SalesPosComponent implements AfterViewInit {
    private readonly productsService = inject(ProductsService);
    private readonly giftCardsService = inject(GiftCardsService);
    private readonly salesService = inject(SalesService);
    private readonly receiptService = inject(SaleReceiptService);
    private readonly imageCompressor = inject(ImageCompressorService);
    private readonly toast = inject(ToastService);
    private readonly confirmationService = inject(ConfirmationService);
    private readonly translate = inject(TranslateService);

    @ViewChild('scanInput') scanInputRef?: ElementRef<HTMLInputElement>;

    scanValue = signal('');
    scanning = signal(false);
    cart = signal<SaleCartLine[]>([]);
    customerName = signal('');
    paymentMethod = signal<PosPaymentMethod>('cash');
    cashReceivedBs = signal<number | null>(null);
    confirming = signal(false);
    lastSale = signal<Sale | null>(null);

    /**
     * Comprobante QR OPCIONAL (Fase 5, prompt §5): se elige y comprime ANTES
     * de confirmar, pero se sube DESPUÉS de que `createSale` ya haya
     * registrado la venta — nunca se acopla críticamente. Si la venta se
     * confirma sin foto seleccionada, o si el adjunto posterior falla, la
     * venta sigue completa igual.
     */
    voucherImage = signal<Blob | null>(null);
    voucherPreviewUrl = signal<string | null>(null);
    compressingVoucher = signal(false);
    attachingVoucher = signal(false);

    /**
     * Pago con gift card (Fase 6, prompt §20): el código se busca con el
     * MISMO pipeline de lector HID + manual que el escaneo de productos — un
     * `<form (ngSubmit)>` de un solo input — pero en un input SEPARADO
     * (prompt §4 pide una sola función de lookup, no dos lógicas distintas;
     * aun así conviene un campo propio porque activar el modo "gift card" no
     * debe interpretar el siguiente Enter como un producto más del carrito).
     * `createSale` es quien de verdad valida todo server-side (plan §21):
     * esta búsqueda es solo UX, para mostrar el monto y el estado antes de
     * confirmar.
     */
    giftCardCodeValue = signal('');
    giftCardLookingUp = signal(false);
    foundGiftCard = signal<GiftCard | null>(null);
    /** Solo se usa si la compra supera el valor de la tarjeta (plan §16.3, fila 4''). */
    giftCardDifferenceMethod = signal<GiftCardDifferenceMethod>('cash');

    readonly totalCents = computed(() =>
        this.cart().reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    );

    /** Monto que realmente se aplica de la tarjeta a esta compra (consumo total, plan §16.2). */
    readonly giftCardAppliedCents = computed(() => {
        const card = this.foundGiftCard();
        return card ? Math.min(card.amountCents, this.totalCents()) : 0;
    });
    /** Sobrante que se pierde si la compra es menor a la denominación de la tarjeta. */
    readonly giftCardForfeitCents = computed(() => {
        const card = this.foundGiftCard();
        return card ? Math.max(0, card.amountCents - this.totalCents()) : 0;
    });
    /** Diferencia a cobrar con el segundo método si la compra supera la denominación. */
    readonly giftCardDifferenceCents = computed(() => {
        const card = this.foundGiftCard();
        return card ? Math.max(0, this.totalCents() - card.amountCents) : 0;
    });

    readonly changeCents = computed(() => {
        if (this.paymentMethod() !== 'cash') return null;
        const received = this.cashReceivedBs();
        if (received === null || received === undefined) return null;
        return toCents(received) - this.totalCents();
    });

    /** Nunca negativo en pantalla: un cambio negativo ya lo bloquea `canConfirm`. */
    readonly changeDisplayCents = computed(() => {
        const change = this.changeCents();
        return change === null ? null : Math.max(0, change);
    });

    readonly canConfirm = computed(() => {
        if (!this.cart().length || this.confirming()) return false;
        if (this.paymentMethod() === 'cash') {
            const change = this.changeCents();
            return change !== null && change >= 0;
        }
        if (this.paymentMethod() === 'giftcard') {
            const card = this.foundGiftCard();
            return card !== null && card.status === 'ACTIVE' && !this.giftCardLookingUp();
        }
        return true;
    });

    ngAfterViewInit(): void {
        this.focusScan();
    }

    /**
     * `F2` confirma y `Esc` vacía el carrito (plan §15.5) — atajos globales
     * porque en un puesto de caja el foco casi siempre está en el input de
     * escaneo, no en un botón.
     */
    @HostListener('document:keydown', ['$event'])
    onGlobalKeydown(event: KeyboardEvent): void {
        if (event.key === 'F2') {
            event.preventDefault();
            this.confirmSale();
        } else if (event.key === 'Escape') {
            this.onClearCart();
        }
    }

    focusScan(): void {
        this.scanInputRef?.nativeElement.focus();
    }

    onScanSubmit(): void {
        const code = this.scanValue().trim();
        if (!code || this.scanning()) return;

        this.scanning.set(true);
        this.productsService.lookupByCode(code).subscribe({
            next: (product) => this.onLookupResult(product),
            error: () => {
                this.scanning.set(false);
                this.scanValue.set('');
                this.toast.error('app.common.errors.general');
                this.focusScan();
            },
        });
    }

    private onLookupResult(product: Product | null): void {
        this.scanning.set(false);
        this.scanValue.set('');

        if (!product) {
            this.toast.error('app.sales.messages.codeNotFound');
            this.focusScan();
            return;
        }
        if (!product.isActive) {
            this.translate
                .get('app.sales.messages.productInactive', { name: product.name })
                .subscribe((message) => this.toast.errorMessage(message));
            this.focusScan();
            return;
        }

        this.addToCart(product);
        this.focusScan();
    }

    private addToCart(product: Product): void {
        this.cart.update((lines) => {
            const existing = lines.find((line) => line.productId === product.id);
            if (existing) {
                return lines.map((line) =>
                    line.productId === product.id
                        ? { ...line, quantity: line.quantity + 1 }
                        : line,
                );
            }
            const newLine: SaleCartLine = {
                productId: product.id,
                code: product.code,
                name: product.name,
                unitPriceCents: product.priceCents,
                quantity: 1,
                stockReference: product.stock,
            };
            return [...lines, newLine];
        });
    }

    incrementQty(line: SaleCartLine): void {
        this.cart.update((lines) =>
            lines.map((l) =>
                l.productId === line.productId ? { ...l, quantity: l.quantity + 1 } : l,
            ),
        );
    }

    /** Si la cantidad llega a 0, la línea se retira del carrito (prompt §8). */
    decrementQty(line: SaleCartLine): void {
        this.cart.update((lines) =>
            lines
                .map((l) =>
                    l.productId === line.productId ? { ...l, quantity: l.quantity - 1 } : l,
                )
                .filter((l) => l.quantity > 0),
        );
    }

    removeLine(line: SaleCartLine): void {
        this.cart.update((lines) => lines.filter((l) => l.productId !== line.productId));
    }

    /** Cambiar de método limpia lo que no le pertenece (voucher QR / búsqueda de gift card). */
    setPaymentMethod(method: PosPaymentMethod): void {
        this.paymentMethod.set(method);
        if (method !== 'qr') {
            this.clearVoucherSelection();
        }
        if (method !== 'giftcard') {
            this.clearGiftCardSelection();
        }
    }

    onGiftCardCodeSubmit(): void {
        const code = this.giftCardCodeValue().trim();
        if (!code || this.giftCardLookingUp()) return;

        this.giftCardLookingUp.set(true);
        this.giftCardsService.lookupByCode(code).subscribe({
            next: (card) => this.onGiftCardLookupResult(card),
            error: () => {
                this.giftCardLookingUp.set(false);
                this.giftCardCodeValue.set('');
                this.toast.error('app.common.errors.general');
            },
        });
    }

    private onGiftCardLookupResult(card: GiftCard | null): void {
        this.giftCardLookingUp.set(false);
        this.giftCardCodeValue.set('');

        if (!card) {
            this.toast.error('app.sales.giftCard.codeNotFound');
            return;
        }
        if (card.status !== 'ACTIVE') {
            this.toast.error('app.sales.giftCard.notActive');
            return;
        }
        this.foundGiftCard.set(card);
    }

    clearGiftCardSelection(): void {
        this.foundGiftCard.set(null);
        this.giftCardCodeValue.set('');
        this.giftCardDifferenceMethod.set('cash');
    }

    async onVoucherSelected(event: Event): Promise<void> {
        const fileInput = event.target as HTMLInputElement;
        const file = fileInput.files?.[0];
        if (!file) return;

        this.compressingVoucher.set(true);
        try {
            const blob = await this.imageCompressor.compressVoucherImage(file);
            this.voucherImage.set(blob);
            this.voucherPreviewUrl.set(URL.createObjectURL(blob));
        } catch {
            this.toast.error('app.common.errors.general');
        } finally {
            this.compressingVoucher.set(false);
            fileInput.value = '';
        }
    }

    clearVoucherSelection(): void {
        this.voucherImage.set(null);
        this.voucherPreviewUrl.set(null);
    }

    hasUploadedVoucher(sale: Sale): boolean {
        return sale.payments.some((p) => p.method === 'qr' && p.voucherStatus === 'uploaded');
    }

    onClearCart(): void {
        if (!this.cart().length) return;

        this.confirmationService.confirm({
            header: this.translate.instant('app.common.confirm'),
            message: this.translate.instant('app.sales.cart.confirmClear'),
            icon: 'fas fa-triangle-exclamation',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => this.resetCart(),
        });
    }

    private resetCart(): void {
        this.cart.set([]);
        this.customerName.set('');
        this.paymentMethod.set('cash');
        this.cashReceivedBs.set(null);
        this.clearVoucherSelection();
        this.clearGiftCardSelection();
        this.focusScan();
    }

    /**
     * Arma `payments[]` para `createSale` (plan §15.1, §16.3, prompt §20).
     * El monto de la gift card que se manda es SOLO lo que el POS calculó
     * para la UX — `createSale` lo recalcula desde la tarjeta real y
     * rechaza si no coincide (plan §21): esta función nunca es la fuente de
     * verdad del dinero, solo arma la intención.
     */
    private buildPayments(): CreateSalePaymentInput[] {
        if (this.paymentMethod() !== 'giftcard') {
            return [{ method: this.paymentMethod(), amountCents: this.totalCents() }];
        }

        const card = this.foundGiftCard();
        if (!card) return [];

        const payments: CreateSalePaymentInput[] = [
            {
                method: 'giftcard',
                amountCents: this.giftCardAppliedCents(),
                giftCardId: card.cardCode,
                giftCardCycleId: card.activeCycleId!,
            },
        ];
        const difference = this.giftCardDifferenceCents();
        if (difference > 0) {
            payments.push({ method: this.giftCardDifferenceMethod(), amountCents: difference });
        }
        return payments;
    }

    confirmSale(): void {
        if (!this.cart().length) {
            this.toast.error('app.sales.messages.emptyCart');
            return;
        }
        if (!this.canConfirm()) {
            const message =
                this.paymentMethod() === 'giftcard'
                    ? 'app.sales.giftCard.searchFirst'
                    : 'app.sales.messages.insufficientCash';
            this.toast.error(message);
            return;
        }

        this.confirming.set(true);
        const saleId = this.salesService.generateSaleId();
        const items = this.cart().map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
        }));
        const payments: CreateSalePaymentInput[] = this.buildPayments();
        const customerName = this.customerName().trim() || undefined;

        this.salesService.createSale({ saleId, items, payments, customerName }).subscribe({
            next: () => this.onSaleCreated(saleId),
            error: (error) => this.onSaleError(error),
        });
    }

    private onSaleCreated(saleId: string): void {
        // Se capturan ANTES de `resetCart()`, que los vacía para la próxima
        // venta — la foto ya comprimida sigue viva en esta variable local.
        const pendingVoucher = this.paymentMethod() === 'qr' ? this.voucherImage() : null;

        this.salesService.getSale(saleId).subscribe({
            next: (sale) => {
                this.confirming.set(false);
                this.toast.success('app.sales.messages.saleCreated');
                this.lastSale.set(sale);
                this.resetCart();
                if (pendingVoucher) {
                    this.attachPendingVoucher(saleId, pendingVoucher);
                }
            },
            error: () => {
                // La venta ya se creó en servidor (esto solo recarga el snapshot
                // para el recibo) — un fallo aquí no debe bloquear el POS.
                this.confirming.set(false);
                this.toast.success('app.sales.messages.saleCreated');
                this.resetCart();
                if (pendingVoucher) {
                    this.attachPendingVoucher(saleId, pendingVoucher);
                }
            },
        });
    }

    /**
     * Sube y adjunta el voucher elegido durante la venta (prompt §5): si
     * falla, la venta YA está completa y registrada — solo se informa que el
     * comprobante no se pudo adjuntar y que se puede reintentar después
     * desde el historial. Nunca revierte ni marca la venta como inválida.
     */
    private attachPendingVoucher(saleId: string, image: Blob): void {
        this.attachingVoucher.set(true);
        this.salesService.attachVoucherWithUpload(saleId, 0, image).subscribe({
            next: () => {
                this.salesService.getSale(saleId).subscribe({
                    next: (sale) => {
                        this.attachingVoucher.set(false);
                        if (sale && this.lastSale()?.id === saleId) {
                            this.lastSale.set(sale);
                        }
                        this.toast.success('app.sales.voucher.attachSuccess');
                    },
                    error: () => this.attachingVoucher.set(false),
                });
            },
            error: () => {
                this.attachingVoucher.set(false);
                this.toast.errorMessage(
                    this.translate.instant('app.sales.voucher.attachFailedDuringSale'),
                );
            },
        });
    }

    /**
     * Los errores de `createSale` ya vienen redactados en español por
     * nosotros mismos (`functions/src/sales.ts`) — mismo patrón que Usuarios
     * y Productos: no es el texto crudo de Firebase que CLAUDE.md prohíbe.
     */
    private onSaleError(error: unknown): void {
        this.confirming.set(false);
        const message = (error as { message?: string })?.message;
        const code = (error as { code?: string })?.code;

        if (code?.startsWith('functions/') && message) {
            this.toast.errorMessage(message);
            return;
        }
        this.toast.error('app.common.errors.general');
    }

    printReceipt(sale: Sale): void {
        this.receiptService.print(sale).catch(() => this.toast.error('app.common.errors.general'));
    }

    dismissConfirmation(): void {
        this.lastSale.set(null);
    }
}
