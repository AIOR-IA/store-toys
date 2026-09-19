import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToastService } from '@core/services';
import { toCents } from '@core/utils';
import { GiftCardCodeMode } from '../../gift-card.model';
import { GiftCardsService } from '../../gift-cards.service';
import { GiftCardLabelDialogComponent, GiftCardLabelTarget } from '../gift-card-label-dialog/gift-card-label-dialog.component';

type RegisterMode = 'single' | 'batch';

const MAX_GENERATED_BATCH_QUANTITY = 50; // espejo de MAX_CODES_PER_BATCH en functions/src/giftcards.ts

/**
 * Alta de tarjetas físicas (solo admin, prompt §13): individual o por lote
 * bajo UNA denominación — nunca "value=100 quantity=6" (prompt §13): cada
 * código se registra como una tarjeta propia, todo o nada.
 *
 * `codeMode` (ajuste posterior a la Fase 6, prompt §4-§11): SIN CAMBIOS el
 * modo `'manual'` (default) — es exactamente el flujo de siempre, código
 * tecleado por quien registra. El modo `'generated'` es nuevo: el servidor
 * decide el código (`GiftCardsService.generateGiftCard`/`generateGiftCardBatch`,
 * atómico), así que aquí no hay nada que "previsualizar" antes de registrar
 * (a diferencia del código interno de Productos, que sí se genera como paso
 * previo) — el resultado se muestra DESPUÉS de crear la tarjeta, con la
 * opción de imprimir su etiqueta ahí mismo (prompt §10).
 */
@Component({
    selector: 'app-gift-card-register-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        DialogModule,
        ButtonModule,
        InputTextModule,
        InputTextareaModule,
        InputNumberModule,
        SelectButtonModule,
        TranslateModule,
        GiftCardLabelDialogComponent,
    ],
    templateUrl: './gift-card-register-dialog.component.html',
})
export class GiftCardRegisterDialogComponent {
    private readonly giftCardsService = inject(GiftCardsService);
    private readonly toast = inject(ToastService);

    visible = input.required<boolean>();
    visibleChange = output<boolean>();
    registered = output<void>();

    readonly modeOptions: { label: string; value: RegisterMode }[] = [
        { label: 'app.giftCards.register.single', value: 'single' },
        { label: 'app.giftCards.register.batch', value: 'batch' },
    ];

    readonly codeModeOptions: { label: string; value: GiftCardCodeMode }[] = [
        { label: 'app.giftCards.register.codeModeManual', value: 'manual' },
        { label: 'app.giftCards.register.codeModeGenerated', value: 'generated' },
    ];

    mode = signal<RegisterMode>('single');
    // Default 'manual' a propósito (prompt §4): conserva el comportamiento
    // actual sin que el admin tenga que elegir nada nuevo.
    codeMode = signal<GiftCardCodeMode>('manual');
    amountBs = signal<number | null>(null);
    code = signal('');
    codesText = signal('');
    quantity = signal<number | null>(null);
    saving = signal(false);

    /** Resultado de una generación exitosa — null mientras se ve el formulario. */
    resultCodes = signal<string[] | null>(null);
    resultAmountCents = signal<number | null>(null);
    labelTarget = signal<GiftCardLabelTarget | null>(null);

    readonly showResult = computed(() => this.resultCodes() !== null);

    readonly batchCodes = computed(() =>
        this.codesText()
            .split('\n')
            .map((c) => c.trim())
            .filter((c) => c.length > 0),
    );

    readonly maxBatchQuantity = MAX_GENERATED_BATCH_QUANTITY;

    close(): void {
        this.visibleChange.emit(false);
        this.resetForm();
    }

    private resetForm(): void {
        this.mode.set('single');
        this.codeMode.set('manual');
        this.amountBs.set(null);
        this.code.set('');
        this.codesText.set('');
        this.quantity.set(null);
        this.resultCodes.set(null);
        this.resultAmountCents.set(null);
        this.labelTarget.set(null);
    }

    submit(): void {
        const amountBs = this.amountBs();
        if (!amountBs || amountBs <= 0) {
            this.toast.error('app.giftCards.messages.amountRequired');
            return;
        }
        const amountCents = toCents(amountBs);

        if (this.codeMode() === 'generated') {
            this.submitGenerated(amountCents);
            return;
        }
        this.submitManual(amountCents);
    }

    private submitManual(amountCents: number): void {
        if (this.mode() === 'single') {
            if (!this.code().trim()) {
                this.toast.error('app.giftCards.messages.codeRequired');
                return;
            }
            this.saving.set(true);
            this.giftCardsService.registerGiftCard(this.code().trim(), amountCents).subscribe({
                next: () => {
                    this.saving.set(false);
                    this.registered.emit();
                    this.close();
                },
                error: (error) => this.onError(error),
            });
            return;
        }

        const codes = this.batchCodes();
        if (!codes.length) {
            this.toast.error('app.giftCards.messages.codesRequired');
            return;
        }
        this.saving.set(true);
        this.giftCardsService.registerGiftCardBatch(amountCents, codes).subscribe({
            next: () => {
                this.saving.set(false);
                this.registered.emit();
                this.close();
            },
            error: (error) => this.onError(error),
        });
    }

    private submitGenerated(amountCents: number): void {
        if (this.mode() === 'single') {
            this.saving.set(true);
            this.giftCardsService.generateGiftCard(amountCents).subscribe({
                next: ({ cardCode }) => this.onGenerated(amountCents, [cardCode]),
                error: (error) => this.onError(error),
            });
            return;
        }

        const quantity = this.quantity();
        if (!quantity || quantity < 1) {
            this.toast.error('app.giftCards.messages.quantityRequired');
            return;
        }
        this.saving.set(true);
        this.giftCardsService.generateGiftCardBatch(amountCents, quantity).subscribe({
            next: ({ cardCodes }) => this.onGenerated(amountCents, cardCodes),
            error: (error) => this.onError(error),
        });
    }

    private onGenerated(amountCents: number, cardCodes: string[]): void {
        this.saving.set(false);
        this.resultCodes.set(cardCodes);
        this.resultAmountCents.set(amountCents);
        // El listado se refresca de una vez — el admin puede seguir viendo
        // el resultado (e imprimir) mientras tanto, sin que eso bloquee nada.
        this.registered.emit();
    }

    openLabel(code: string): void {
        const amountCents = this.resultAmountCents();
        if (amountCents === null) return;
        this.labelTarget.set({ code, amountCents });
    }

    closeLabel(): void {
        this.labelTarget.set(null);
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
