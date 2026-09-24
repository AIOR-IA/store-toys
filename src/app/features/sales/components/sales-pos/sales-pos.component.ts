import { CommonModule } from '@angular/common';
import {
    AfterViewInit,
    Component,
    ElementRef,
    HostListener,
    ViewChild,
    computed,
    effect,
    inject,
    signal,
    untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
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
import { SALE_DISCOUNT_OPTIONS_CENTS, isDiscountApplicable } from '../../sale-discount.const';
import { SaleReceiptService } from '../../sale-receipt.service';
import { CreateSalePaymentInput, SalesService } from '../../sales.service';
import { PaymentMethod, Sale, SaleCartLine } from '../../sale.model';

/**
 * Lo que el vendedor elige en pantalla. `'cashqr'` NO es un `PaymentMethod` de
 * la venta: es un modo del POS que se descompone en DOS pagos (`cash` + `qr`)
 * al armar `payments[]` (plan §15.1) — el servidor nunca ve `'cashqr'`.
 */
type PosPaymentMethod = PaymentMethod | 'cashqr';
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
        DropdownModule,
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

    /**
     * Rebaja fija opcional (Ajuste de Ventas, obs. 1) — lo que el vendedor
     * ELIGIÓ. Vuelve a 0 con cada venta nueva (`resetCart`). Es solo la
     * intención: `createSale` la valida y recalcula el total en servidor.
     */
    discountCents = signal(0);

    readonly subtotalCents = computed(() =>
        this.cart().reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    );

    /**
     * La rebaja realmente aplicada: si la elegida dejó de ser válida para el
     * subtotal (el carrito cambió), vale 0 — pero nunca en silencio: el
     * `effect` del constructor además reinicia la selección y avisa.
     */
    readonly appliedDiscountCents = computed(() => {
        const discount = this.discountCents();
        return isDiscountApplicable(discount, this.subtotalCents()) ? discount : 0;
    });

    /** Total FINAL a pagar: sobre este importe se calculan efectivo, QR y gift card. */
    readonly totalCents = computed(() => this.subtotalCents() - this.appliedDiscountCents());

    /** Solo las rebajas permitidas; las que no caben en el subtotal actual quedan deshabilitadas. */
    readonly discountOptions = computed(() =>
        SALE_DISCOUNT_OPTIONS_CENTS.map((value) => ({
            value,
            disabled: !isDiscountApplicable(value, this.subtotalCents()),
        })),
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

    /**
     * Modo «Efectivo + QR» (Ajuste de Ventas, obs. 2): el vendedor SOLO teclea
     * el monto por QR — el que muestra la app del banco, exacto. El efectivo
     * aplicado es lo que falta para el total (`total − QR`), así el orden en
     * que se piensen los dos importes no existe y la suma es exacta por
     * construcción. Todo se calcula en centavos enteros; `qrPartBs` solo es el
     * valor crudo del campo (`toCents` en el borde del formulario, plan §17.1).
     */
    qrPartBs = signal<number | null>(null);

    readonly mixedQrCents = computed(() => {
        const qr = this.qrPartBs();
        return qr === null || qr === undefined ? 0 : toCents(qr);
    });
    /** `0 < QR < total`: con `QR == total` el efectivo aplicado sería 0 (eso es «QR» a secas). */
    readonly isMixedQrValid = computed(() => {
        const qr = this.mixedQrCents();
        return Number.isSafeInteger(qr) && qr > 0 && qr < this.totalCents();
    });
    /** Hay algo tecleado pero no sirve: se muestra el aviso en línea y se bloquea confirmar. */
    readonly mixedQrInvalid = computed(() => this.qrPartBs() != null && !this.isMixedQrValid());
    readonly mixedCashCents = computed(() =>
        this.isMixedQrValid() ? this.totalCents() - this.mixedQrCents() : 0,
    );

    /**
     * Efectivo APLICADO a la venta (el que viaja en `payments[]`), distinto
     * del efectivo RECIBIDO: el cambio nunca es un ingreso.
     */
    readonly cashAppliedCents = computed(() => {
        switch (this.paymentMethod()) {
            case 'cash':
                return this.totalCents();
            case 'cashqr':
                return this.mixedCashCents();
            default:
                return 0;
        }
    });

    /**
     * Cambio = efectivo recibido − efectivo APLICADO (no el total de la
     * venta). Solo de pantalla: ni el recibido ni el cambio se guardan.
     */
    readonly changeCents = computed(() => {
        const method = this.paymentMethod();
        if (method !== 'cash' && method !== 'cashqr') return null;
        if (method === 'cashqr' && !this.isMixedQrValid()) return null;
        const received = this.cashReceivedBs();
        if (received === null || received === undefined) return null;
        return toCents(received) - this.cashAppliedCents();
    });

    /** Nunca negativo en pantalla: un cambio negativo ya lo bloquea `canConfirm`. */
    readonly changeDisplayCents = computed(() => {
        const change = this.changeCents();
        return change === null ? null : Math.max(0, change);
    });

    readonly canConfirm = computed(() => {
        if (!this.cart().length || this.confirming()) return false;
        if (this.paymentMethod() === 'cash' || this.paymentMethod() === 'cashqr') {
            // En «Efectivo + QR», `changeCents` es null mientras el monto QR no sea válido.
            const change = this.changeCents();
            return change !== null && change >= 0;
        }
        if (this.paymentMethod() === 'giftcard') {
            const card = this.foundGiftCard();
            return card !== null && card.status === 'ACTIVE' && !this.giftCardLookingUp();
        }
        return true;
    });

    constructor() {
        // Si el carrito cambia y la rebaja elegida deja de aplicar (p. ej. Bs
        // 30 sobre un subtotal de Bs 20), se reinicia a "Sin rebaja" y se
        // avisa: nunca se envía en silencio una venta con otro total del que
        // el vendedor vio al elegirla.
        effect(() => {
            const discount = this.discountCents();
            if (discount > 0 && !isDiscountApplicable(discount, this.subtotalCents())) {
                untracked(() => this.discountCents.set(0));
                this.toast.info('app.sales.discount.resetByCart');
            }
        });

        // Si el total cambia (cantidad, producto o rebaja) y el monto por QR
        // tecleado ya no es válido, se reinicia y se avisa. Solo depende del
        // total: reaccionar también al propio campo borraría el valor mientras
        // el vendedor todavía está escribiendo. Un QR que sigue siendo válido
        // se conserva y el efectivo aplicado se recalcula solo (`total − QR`).
        // Mientras tanto `isMixedQrValid` ya bloquea confirmar, así que nunca
        // se envía una venta con un estado anterior inconsistente.
        effect(() => {
            this.totalCents();
            untracked(() => {
                if (this.paymentMethod() === 'cashqr' && this.mixedQrInvalid()) {
                    this.qrPartBs.set(null);
                    this.toast.info('app.sales.mixed.resetByTotal');
                }
            });
        });
    }

    ngAfterViewInit(): void {
        this.focusScan();
    }

    onDiscountChange(discountCents: number): void {
        this.discountCents.set(discountCents);
        this.focusScan(); // el lector USB HID espera el foco en el input de escaneo
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

    /** Cambiar de método limpia lo que no le pertenece (voucher QR / búsqueda de gift card / monto QR mixto). */
    setPaymentMethod(method: PosPaymentMethod): void {
        this.paymentMethod.set(method);
        if (method !== 'qr' && method !== 'cashqr') {
            this.clearVoucherSelection();
        }
        if (method !== 'giftcard') {
            this.clearGiftCardSelection();
        }
        if (method !== 'cashqr') {
            this.qrPartBs.set(null);
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
        // La rebaja se limpia ANTES que el carrito: así el `effect` de la
        // rebaja nunca ve un estado inválido y no avisa por una limpieza normal.
        this.discountCents.set(0);
        this.qrPartBs.set(null);
        this.paymentMethod.set('cash');
        this.cart.set([]);
        this.customerName.set('');
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
        const method = this.paymentMethod();

        // «Efectivo + QR»: dos pagos que suman EXACTAMENTE el total final.
        // `cash` es el efectivo APLICADO (`total − QR`), nunca lo recibido.
        if (method === 'cashqr') {
            if (!this.isMixedQrValid()) return [];
            return [
                { method: 'cash', amountCents: this.mixedCashCents() },
                { method: 'qr', amountCents: this.mixedQrCents() },
            ];
        }

        if (method !== 'giftcard') {
            return [{ method, amountCents: this.totalCents() }];
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
            let message = 'app.sales.messages.insufficientCash';
            if (this.paymentMethod() === 'giftcard') {
                message = 'app.sales.giftCard.searchFirst';
            } else if (this.paymentMethod() === 'cashqr' && !this.isMixedQrValid()) {
                message = 'app.sales.mixed.invalidQr';
            }
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
        // Solo se envía la intención; el servidor recalcula subtotal y total.
        const discountCents = this.appliedDiscountCents() || undefined;

        this.salesService
            .createSale({ saleId, items, payments, customerName, discountCents })
            .subscribe({
                next: () => this.onSaleCreated(saleId, payments),
                error: (error) => this.onSaleError(error),
            });
    }

    private onSaleCreated(saleId: string, sentPayments: CreateSalePaymentInput[]): void {
        // Se capturan ANTES de `resetCart()`, que los vacía para la próxima
        // venta — la foto ya comprimida sigue viva en esta variable local.
        //
        // El índice del pago QR sale del MISMO arreglo que se envió a
        // `createSale` (el servidor guarda `payments[]` en ese orden): en QR
        // solo es 0, en «Efectivo + QR» es 1, en «Gift Card + QR» es 1. Nunca
        // se asume una posición fija (`attachVoucher` rechaza un índice que no
        // sea un pago QR). `-1` = la venta no tiene pago QR: nada que adjuntar.
        const qrPaymentIndex = sentPayments.findIndex((p) => p.method === 'qr');
        const pendingVoucher = qrPaymentIndex >= 0 ? this.voucherImage() : null;

        this.salesService.getSale(saleId).subscribe({
            next: (sale) => {
                this.confirming.set(false);
                this.toast.success('app.sales.messages.saleCreated');
                this.lastSale.set(sale);
                this.resetCart();
                if (pendingVoucher) {
                    this.attachPendingVoucher(saleId, qrPaymentIndex, pendingVoucher);
                }
            },
            error: () => {
                // La venta ya se creó en servidor (esto solo recarga el snapshot
                // para el recibo) — un fallo aquí no debe bloquear el POS.
                this.confirming.set(false);
                this.toast.success('app.sales.messages.saleCreated');
                this.resetCart();
                if (pendingVoucher) {
                    this.attachPendingVoucher(saleId, qrPaymentIndex, pendingVoucher);
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
    private attachPendingVoucher(saleId: string, paymentIndex: number, image: Blob): void {
        this.attachingVoucher.set(true);
        this.salesService.attachVoucherWithUpload(saleId, paymentIndex, image).subscribe({
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
