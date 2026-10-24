import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { RadioButtonModule } from 'primeng/radiobutton';
import { TagModule } from 'primeng/tag';
import { SpinnerComponent } from '@shared/components/ui';
import { MoneyPipe } from '@shared/pipes';
import { SessionService } from '@core/session';
import { ToastService } from '@core/services';
import { fromCents, toCents } from '@core/utils';
import { GiftCardReceiptService } from '../../gift-card-receipt.service';
import {
    GiftCard,
    GiftCardIssuePaymentMethod,
    GiftCardMovement,
    GiftCardReceipt,
} from '../../gift-card.model';
import { GiftCardsService } from '../../gift-cards.service';
import { GiftCardLabelDialogComponent, GiftCardLabelTarget } from '../gift-card-label-dialog/gift-card-label-dialog.component';

type PanelMode = 'view' | 'activate' | 'suspend' | 'cancel' | 'editAmount' | 'replace';

/**
 * Detalle de una gift card (Fase 6, prompt §33): info + acciones de ciclo de
 * vida inline (mismo patrón que `sale-detail-dialog` para `cancelSale`: el
 * motivo se pide en un campo dentro del propio diálogo, no en uno aparte) y,
 * solo para admin, el historial completo de movimientos entre todos los
 * ciclos.
 */
@Component({
    selector: 'app-gift-card-detail-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        DialogModule,
        ButtonModule,
        InputTextModule,
        InputNumberModule,
        InputTextareaModule,
        RadioButtonModule,
        TagModule,
        ConfirmDialogModule,
        TranslateModule,
        MoneyPipe,
        SpinnerComponent,
        GiftCardLabelDialogComponent,
    ],
    providers: [ConfirmationService],
    templateUrl: './gift-card-detail-dialog.component.html',
})
export class GiftCardDetailDialogComponent {
    private readonly giftCardsService = inject(GiftCardsService);
    private readonly receiptService = inject(GiftCardReceiptService);
    private readonly sessionService = inject(SessionService);
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);
    private readonly confirmationService = inject(ConfirmationService);

    visible = input.required<boolean>();
    card = input<GiftCard | null>(null);

    visibleChange = output<boolean>();
    changed = output<void>();

    readonly isAdmin = computed(() => {
        const session = this.sessionService.session();
        return session.status === 'active' && session.role === 'admin';
    });

    mode = signal<PanelMode>('view');
    buyerName = signal('');
    activatePaymentMethod = signal<GiftCardIssuePaymentMethod>('cash');
    suspendReason = signal('');
    cancelReason = signal('');
    newAmountBs = signal<number | null>(null);
    replaceReason = signal('');
    /** Resultado del reemplazo, mientras el panel sigue abierto (ver `confirmReplace`). */
    replacedResult = signal<{ newCardCode: string; amountCents: number } | null>(null);
    saving = signal(false);

    /**
     * Recibo de la emisión recién vendida (ajuste posterior, Recibo/Historial
     * de Gift Cards): mismo patrón que `replacedResult` arriba — al vender
     * con éxito el panel NO se cierra, se queda mostrando `[Imprimir recibo]`
     * (prompt §4: "NO bloquear la activación si el usuario decide no
     * imprimir"). Se llena con una relectura real vía `getIssueReceipt`
     * (nunca se construye a mano en el cliente): es la misma Function que
     * reimprime después desde el Historial, así los dos caminos nunca pueden
     * mostrar algo distinto para el mismo ciclo.
     */
    activatedReceipt = signal<GiftCardReceipt | null>(null);
    loadingReceipt = signal(false);
    printingReceipt = signal(false);

    /**
     * Snapshot refrescado tras `cancelGiftCard` (prompt §11): el `card()`
     * input lo controla el padre y no cambia hasta que vuelva a cargar la
     * lista — sin esto, tras cancelar una `ACTIVE` el panel seguiría
     * mostrando el estado viejo hasta cerrar y reabrir el diálogo a mano.
     * `null` = usar `card()` tal cual. Se limpia cada vez que `card()`
     * cambia de verdad (ver el `effect()` del constructor).
     */
    private readonly cardOverride = signal<GiftCard | null>(null);
    /** La tarjeta que realmente debe pintar la plantilla — ver `cardOverride`. */
    readonly displayCard = computed(() => this.cardOverride() ?? this.card());

    /**
     * Solo admin, y solo mientras `AVAILABLE` (prompt §5, §6, §35, §41): una
     * vez vendida/activada, el monto queda congelado en el ciclo — la Function
     * `updateGiftCardAmount` ya lo rechaza server-side; esto solo evita
     * mostrar una acción que de todas formas se rechazaría.
     */
    readonly canEditAmount = computed(() => {
        const card = this.displayCard();
        return !!card && this.isAdmin() && card.status === 'AVAILABLE';
    });

    /**
     * Elegibilidad del reemplazo (regla de flujo definitiva, ajuste
     * posterior): el reemplazo YA NO es directo desde `ACTIVE`/`SUSPENDED`
     * — el admin primero debe cancelar definitivamente. Solo es elegible
     * una tarjeta `CANCELLED` con `pendingReplacement === true` (quedó así
     * porque tenía un ciclo pagado sin consumir al cancelarse) y que
     * todavía no se haya reemplazado (`replacedByCode` sigue `null`).
     * Mismos campos y mismo criterio que valida `replaceGiftCard`
     * server-side. Fallback `?? false`: tarjetas creadas antes de este
     * ajuste no tienen el campo, y nunca deben aparecer como elegibles para
     * un reemplazo "fantasma".
     */
    readonly canReplace = computed(() => {
        const card = this.displayCard();
        if (!card || !this.isAdmin() || card.replacedByCode) return false;
        return card.status === 'CANCELLED' && (card.pendingReplacement ?? false) === true;
    });

    movements = signal<GiftCardMovement[]>([]);
    loadingMovements = signal(false);

    /**
     * Etiqueta de impresión (ajuste posterior a la Fase 6, prompt §15-§16):
     * admin-only, igual que registrar — funciona para códigos manuales Y
     * generados por igual, porque el diálogo solo necesita `{code,
     * amountCents}`, no distingue el origen del código.
     */
    labelTarget = signal<GiftCardLabelTarget | null>(null);

    constructor() {
        // Al cambiar de tarjeta (o cerrar/abrir), vuelve siempre a la vista
        // de solo lectura y recarga el historial — mismo patrón de
        // `effect()` + `untracked()` que `ProductFormDialogComponent` (ver
        // el comentario largo ahí sobre por qué NO `allowSignalWrites`).
        effect(() => {
            const card = this.card();
            const admin = this.isAdmin();
            untracked(() => {
                this.mode.set('view');
                this.buyerName.set('');
                this.activatePaymentMethod.set('cash');
                this.suspendReason.set('');
                this.cancelReason.set('');
                this.newAmountBs.set(null);
                this.replaceReason.set('');
                this.replacedResult.set(null);
                this.activatedReceipt.set(null);
                this.cardOverride.set(null);
                this.movements.set([]);
                this.labelTarget.set(null);
                if (card && admin) {
                    this.loadMovements(card.cardCode);
                }
            });
        });
    }

    private loadMovements(cardCode: string): void {
        this.loadingMovements.set(true);
        this.giftCardsService.getMovements(cardCode).subscribe({
            next: (movements) => {
                this.movements.set(movements);
                this.loadingMovements.set(false);
            },
            error: () => this.loadingMovements.set(false),
        });
    }

    close(): void {
        this.visibleChange.emit(false);
    }

    openActivate(): void {
        this.mode.set('activate');
    }
    openSuspend(): void {
        this.mode.set('suspend');
    }
    openCancel(): void {
        this.mode.set('cancel');
    }
    openEditAmount(): void {
        const card = this.displayCard();
        if (!card) return;
        this.newAmountBs.set(fromCents(card.amountCents));
        this.mode.set('editAmount');
    }
    openReplace(): void {
        this.replaceReason.set('');
        this.replacedResult.set(null);
        this.mode.set('replace');
    }
    backToView(): void {
        this.mode.set('view');
    }

    openLabel(card: GiftCard): void {
        this.labelTarget.set({ code: card.cardCode, amountCents: card.amountCents });
    }

    closeLabel(): void {
        this.labelTarget.set(null);
    }

    /**
     * Al vender con éxito, el panel NO se cierra (ajuste posterior,
     * Recibo/Historial de Gift Cards — mismo patrón que `confirmReplace`):
     * se queda mostrando `[Imprimir recibo]`, con una relectura real de la
     * emisión (`getIssueReceipt`) para obtener la fecha/hora real del
     * servidor — igual que `SalesPosComponent.onSaleCreated` vuelve a leer
     * la venta con `getSale` después de `createSale`. Si esa relectura
     * falla, la venta YA está completa igual (prompt §4): solo se informa y
     * se cierra el panel, sin bloquear nada.
     */
    confirmActivate(): void {
        const card = this.displayCard();
        if (!card) return;

        this.saving.set(true);
        this.giftCardsService
            .activateGiftCard({
                code: card.cardCode,
                buyerName: this.buyerName().trim() || undefined,
                payments: [{ method: this.activatePaymentMethod(), amountCents: card.amountCents }],
            })
            .subscribe({
                next: ({ cycleId }) => {
                    this.saving.set(false);
                    this.toast.success('app.giftCards.messages.activated');
                    this.changed.emit();
                    this.loadActivatedReceipt(cycleId);
                },
                error: (error) => this.onError(error),
            });
    }

    private loadActivatedReceipt(issueId: string): void {
        this.loadingReceipt.set(true);
        this.giftCardsService.getIssueReceipt(issueId).subscribe({
            next: (receipt) => {
                this.loadingReceipt.set(false);
                this.activatedReceipt.set(receipt);
            },
            error: () => {
                this.loadingReceipt.set(false);
                this.close();
            },
        });
    }

    printActivatedReceipt(): void {
        const receipt = this.activatedReceipt();
        if (!receipt) return;

        this.printingReceipt.set(true);
        this.receiptService
            .print(receipt)
            .catch(() => this.toast.error('app.common.errors.general'))
            .finally(() => this.printingReceipt.set(false));
    }

    /**
     * Cambia el monto configurado (solo admin + AVAILABLE, prompt §5-§8):
     * nunca es un ingreso — la Function solo deja un movimiento
     * `AMOUNT_CHANGED` de auditoría, nunca toca `dailySummaries`.
     */
    confirmEditAmount(): void {
        const card = this.displayCard();
        if (!card) return;
        const bs = this.newAmountBs();
        if (!bs || bs <= 0) {
            this.toast.error('app.giftCards.messages.amountRequired');
            return;
        }
        const amountCents = toCents(bs);
        if (amountCents === card.amountCents) {
            this.toast.error('app.giftCards.messages.amountUnchanged');
            return;
        }

        this.saving.set(true);
        this.giftCardsService.updateGiftCardAmount(card.cardCode, amountCents).subscribe({
            next: () => {
                this.saving.set(false);
                this.toast.success('app.giftCards.messages.amountUpdated');
                this.changed.emit();
                this.close();
            },
            error: (error) => this.onError(error),
        });
    }

    /**
     * Reemplaza el plástico (solo admin, prompt §12-§22, §36-§37): transfiere
     * el valor ya pagado a un código nuevo, SIN cobrar de nuevo. Doble
     * confirmación a propósito (el panel ya explica el efecto, y esto
     * todavía pide un último clic) porque es definitivo para el código viejo
     * — mismo patrón que `confirmCancel`.
     *
     * A diferencia de las demás acciones, NO cierra el diálogo al terminar:
     * se queda abierto mostrando el código nuevo para imprimir su etiqueta
     * (prompt §34, §36) — cerrarlo de una vez limpiaría `labelTarget`, porque
     * el padre soltaría `card()` a `null` (ver el `effect()` del
     * constructor) antes de que la etiqueta llegara a abrirse.
     */
    confirmReplace(): void {
        const card = this.displayCard();
        if (!card) return;

        this.confirmationService.confirm({
            header: this.translate.instant('app.common.confirm'),
            message: this.translate.instant('app.giftCards.messages.confirmReplace'),
            icon: 'fas fa-retweet',
            acceptButtonStyleClass: 'p-button-warning',
            accept: () => {
                this.saving.set(true);
                this.giftCardsService
                    .replaceGiftCard(card.cardCode, this.replaceReason().trim() || undefined)
                    .subscribe({
                        next: ({ newCardCode, amountCents }) => {
                            this.saving.set(false);
                            this.toast.success('app.giftCards.messages.replaced');
                            this.changed.emit();
                            this.replacedResult.set({ newCardCode, amountCents });
                        },
                        error: (error) => this.onError(error),
                    });
            },
        });
    }

    printReplacementLabel(): void {
        const result = this.replacedResult();
        if (!result) return;
        this.labelTarget.set({ code: result.newCardCode, amountCents: result.amountCents });
    }

    confirmSuspend(): void {
        const card = this.displayCard();
        if (!card) return;
        if (!this.suspendReason().trim()) {
            this.toast.error('app.giftCards.messages.reasonRequired');
            return;
        }

        this.saving.set(true);
        this.giftCardsService.suspendGiftCard(card.cardCode, this.suspendReason().trim()).subscribe({
            next: () => {
                this.saving.set(false);
                this.toast.success('app.giftCards.messages.suspended');
                this.changed.emit();
                this.close();
            },
            error: (error) => this.onError(error),
        });
    }

    confirmReactivate(): void {
        const card = this.displayCard();
        if (!card) return;

        this.confirmationService.confirm({
            header: this.translate.instant('app.common.confirm'),
            message: this.translate.instant('app.giftCards.messages.confirmReactivate'),
            icon: 'fas fa-circle-check',
            acceptButtonStyleClass: 'p-button-success',
            accept: () => {
                this.saving.set(true);
                this.giftCardsService.reactivateGiftCard(card.cardCode).subscribe({
                    next: () => {
                        this.saving.set(false);
                        this.toast.success('app.giftCards.messages.reactivated');
                        this.changed.emit();
                        this.close();
                    },
                    error: (error) => this.onError(error),
                });
            },
        });
    }

    /**
     * A diferencia de las demás acciones, NO cierra el diálogo al terminar
     * (prompt §11): se queda abierto, refrescado, para que si la tarjeta
     * quedó con `pendingReplacement: true` el admin vea de inmediato la
     * acción "Reemplazar tarjeta" sin tener que cerrar y volver a abrir el
     * modal a mano. El `card()` input es del padre y no cambia solo —
     * `cardOverride` se actualiza aquí con una relectura real del documento
     * (`lookupByCode`, la misma que ya usa el buscador del listado) en vez
     * de adivinar el resultado: así `canReplace` refleja exactamente lo que
     * `cancelGiftCard` decidió server-side, no una suposición del cliente.
     */
    confirmCancel(): void {
        const card = this.displayCard();
        if (!card) return;
        if (!this.cancelReason().trim()) {
            this.toast.error('app.giftCards.messages.reasonRequired');
            return;
        }

        this.confirmationService.confirm({
            header: this.translate.instant('app.common.confirm'),
            message: this.translate.instant('app.giftCards.messages.confirmCancel'),
            icon: 'fas fa-triangle-exclamation',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.saving.set(true);
                this.giftCardsService.cancelGiftCard(card.cardCode, this.cancelReason().trim()).subscribe({
                    next: () => {
                        this.saving.set(false);
                        this.toast.success('app.giftCards.messages.cancelled');
                        this.changed.emit();
                        this.mode.set('view');
                        this.giftCardsService.lookupByCode(card.cardCode).subscribe({
                            next: (fresh) => {
                                if (fresh) this.cardOverride.set(fresh);
                            },
                            error: () => undefined,
                        });
                    },
                    error: (error) => this.onError(error),
                });
            },
        });
    }

    private onError(error: unknown): void {
        this.saving.set(false);
        const message = (error as { message?: string })?.message;
        const code = (error as { code?: string })?.code;
        if (code?.startsWith('functions/') && message) {
            this.toast.errorMessage(message);
            return;
        }
        this.toast.error('app.common.errors.general');
    }
}
