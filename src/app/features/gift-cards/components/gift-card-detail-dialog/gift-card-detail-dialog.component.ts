import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { RadioButtonModule } from 'primeng/radiobutton';
import { TagModule } from 'primeng/tag';
import { MoneyPipe } from '@shared/pipes';
import { SessionService } from '@core/session';
import { ToastService } from '@core/services';
import { GiftCard, GiftCardIssuePaymentMethod, GiftCardMovement } from '../../gift-card.model';
import { GiftCardsService } from '../../gift-cards.service';
import { GiftCardLabelDialogComponent, GiftCardLabelTarget } from '../gift-card-label-dialog/gift-card-label-dialog.component';

type PanelMode = 'view' | 'activate' | 'suspend' | 'cancel';

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
        InputTextareaModule,
        RadioButtonModule,
        TagModule,
        ConfirmDialogModule,
        TranslateModule,
        MoneyPipe,
        GiftCardLabelDialogComponent,
    ],
    providers: [ConfirmationService],
    templateUrl: './gift-card-detail-dialog.component.html',
})
export class GiftCardDetailDialogComponent {
    private readonly giftCardsService = inject(GiftCardsService);
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
    saving = signal(false);

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
    backToView(): void {
        this.mode.set('view');
    }

    openLabel(card: GiftCard): void {
        this.labelTarget.set({ code: card.cardCode, amountCents: card.amountCents });
    }

    closeLabel(): void {
        this.labelTarget.set(null);
    }

    confirmActivate(): void {
        const card = this.card();
        if (!card) return;

        this.saving.set(true);
        this.giftCardsService
            .activateGiftCard({
                code: card.cardCode,
                buyerName: this.buyerName().trim() || undefined,
                payments: [{ method: this.activatePaymentMethod(), amountCents: card.amountCents }],
            })
            .subscribe({
                next: () => {
                    this.saving.set(false);
                    this.toast.success('app.giftCards.messages.activated');
                    this.changed.emit();
                    this.close();
                },
                error: (error) => this.onError(error),
            });
    }

    confirmSuspend(): void {
        const card = this.card();
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
        const card = this.card();
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

    confirmCancel(): void {
        const card = this.card();
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
                        this.close();
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
