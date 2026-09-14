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
import { ToastService } from '@core/services';
import { toCents } from '@core/utils';
import { Product } from '../../../products/product.model';
import { ProductsService } from '../../../products/products.service';
import { SaleReceiptService } from '../../sale-receipt.service';
import { CreateSalePaymentInput, SalesService } from '../../sales.service';
import { PaymentMethod, Sale, SaleCartLine } from '../../sale.model';

type PosPaymentMethod = Extract<PaymentMethod, 'cash' | 'qr'>;

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
    private readonly salesService = inject(SalesService);
    private readonly receiptService = inject(SaleReceiptService);
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

    readonly totalCents = computed(() =>
        this.cart().reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    );

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
        this.focusScan();
    }

    confirmSale(): void {
        if (!this.cart().length) {
            this.toast.error('app.sales.messages.emptyCart');
            return;
        }
        if (!this.canConfirm()) {
            this.toast.error('app.sales.messages.insufficientCash');
            return;
        }

        this.confirming.set(true);
        const saleId = this.salesService.generateSaleId();
        const items = this.cart().map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
        }));
        const payments: CreateSalePaymentInput[] = [
            { method: this.paymentMethod(), amountCents: this.totalCents() },
        ];
        const customerName = this.customerName().trim() || undefined;

        this.salesService.createSale({ saleId, items, payments, customerName }).subscribe({
            next: () => this.onSaleCreated(saleId),
            error: (error) => this.onSaleError(error),
        });
    }

    private onSaleCreated(saleId: string): void {
        this.salesService.getSale(saleId).subscribe({
            next: (sale) => {
                this.confirming.set(false);
                this.toast.success('app.sales.messages.saleCreated');
                this.lastSale.set(sale);
                this.resetCart();
            },
            error: () => {
                // La venta ya se creó en servidor (esto solo recarga el snapshot
                // para el recibo) — un fallo aquí no debe bloquear el POS.
                this.confirming.set(false);
                this.toast.success('app.sales.messages.saleCreated');
                this.resetCart();
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
