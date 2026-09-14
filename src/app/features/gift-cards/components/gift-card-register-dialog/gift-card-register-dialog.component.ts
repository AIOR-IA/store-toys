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
import { GiftCardsService } from '../../gift-cards.service';

type RegisterMode = 'single' | 'batch';

/**
 * Alta de tarjetas físicas (solo admin, prompt §13): individual o por lote
 * bajo UNA denominación — nunca "value=100 quantity=6" (prompt §13): cada
 * código se registra como una tarjeta propia, todo o nada.
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

    mode = signal<RegisterMode>('single');
    amountBs = signal<number | null>(null);
    code = signal('');
    codesText = signal('');
    saving = signal(false);

    readonly batchCodes = computed(() =>
        this.codesText()
            .split('\n')
            .map((c) => c.trim())
            .filter((c) => c.length > 0),
    );

    close(): void {
        this.visibleChange.emit(false);
        this.resetForm();
    }

    private resetForm(): void {
        this.mode.set('single');
        this.amountBs.set(null);
        this.code.set('');
        this.codesText.set('');
    }

    submit(): void {
        const amountBs = this.amountBs();
        if (!amountBs || amountBs <= 0) {
            this.toast.error('app.giftCards.messages.amountRequired');
            return;
        }
        const amountCents = toCents(amountBs);

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
