import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import {
    CardsPaginatorComponent,
    ItemsNotFoundComponent,
    SearchBarComponent,
    SpinnerComponent,
    TitleBarComponent,
} from '@shared/components/ui';
import { MoneyPipe } from '@shared/pipes';
import { SessionService } from '@core/session';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, PageSize } from '@core/data';
import { ToastService } from '@core/services';
import { normalizeGiftCardCode } from '@core/utils';
import { SalesService } from '../../../sales/sales.service';
import { GiftCardIssueDetailDialogComponent } from '../gift-card-issue-detail-dialog/gift-card-issue-detail-dialog.component';
import { GiftCardIssuesHistoryFilter, GiftCardsService } from '../../gift-cards.service';
import { GiftCardReceipt } from '../../gift-card.model';

/**
 * Historial de emisiones/ventas REALES de Gift Card (ajuste posterior,
 * Recibo/Historial de Gift Cards, sin abrir una fase nueva). REFERENCIA
 * DIRECTA de `SalesHistoryComponent` (prompt §9, §28.7): mismo esqueleto —
 * búsqueda, filtro de vendedor (solo admin), paginación por cursores, abrir
 * detalle — pero sobre `listGiftCardIssues` (Function) en vez de una `Query`
 * directa, porque `giftCardIssues` es admin-only en las Rules (ver el
 * comentario largo de la Function en `functions/src/giftcards.ts`).
 *
 * `SalesService.listSellers()` se reutiliza tal cual (prompt §1: "reutilizar
 * la mayor cantidad razonable de infraestructura") — es una consulta
 * genérica sobre `users`, sin nada específico de Ventas.
 *
 * SIN filtro de fecha a propósito, a diferencia de `SalesHistoryComponent`
 * (ver el comentario de `listGiftCardIssues`): a esta escala (20-40
 * tarjetas, CLAUDE.md) no aporta y solo complicaría la pantalla.
 */
@Component({
    selector: 'app-gift-card-history',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        DropdownModule,
        TableModule,
        TagModule,
        TooltipModule,
        TranslateModule,
        MoneyPipe,
        TitleBarComponent,
        SearchBarComponent,
        ItemsNotFoundComponent,
        SpinnerComponent,
        CardsPaginatorComponent,
        GiftCardIssueDetailDialogComponent,
    ],
    templateUrl: './gift-card-history.component.html',
})
export class GiftCardHistoryComponent implements OnInit {
    private readonly giftCardsService = inject(GiftCardsService);
    private readonly salesService = inject(SalesService);
    private readonly sessionService = inject(SessionService);
    private readonly toast = inject(ToastService);

    readonly pageSizeOptions: PageSize[] = PAGE_SIZE_OPTIONS;

    readonly isAdmin = computed(() => {
        const session = this.sessionService.session();
        return session.status === 'active' && session.role === 'admin';
    });
    private readonly currentUid = computed(() => {
        const session = this.sessionService.session();
        return session.status === 'active' ? session.uid : '';
    });

    cardCode = signal('');
    sellerId = signal<string | null>(null);
    sellers = signal<{ uid: string; name: string }[]>([]);
    pageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);

    rows = signal<GiftCardReceipt[]>([]);
    total = signal(0);
    hasNext = signal(false);
    hasPrev = signal(false);
    loading = signal(false);
    hasLoadedOnce = signal(false);

    detailReceipt = signal<GiftCardReceipt | null>(null);

    private pager = this.giftCardsService.createIssuesHistoryPager(
        this.currentFilter(),
        this.pageSize(),
    );

    ngOnInit(): void {
        if (this.isAdmin()) {
            this.salesService.listSellers().subscribe({
                next: (sellers) => this.sellers.set(sellers),
                error: () => undefined, // el filtro de vendedor es una comodidad, no bloquea el historial
            });
        }
        this.loadFirstPage();
    }

    private currentFilter(): GiftCardIssuesHistoryFilter {
        return {
            cardCode: this.cardCode() || undefined,
            sellerId: this.isAdmin() ? (this.sellerId() ?? undefined) : this.currentUid(),
        };
    }

    onSearch(term: string): void {
        this.cardCode.set(term.trim() ? normalizeGiftCardCode(term) : '');
        this.loadFirstPage();
    }

    onSellerChange(uid: string | null): void {
        this.sellerId.set(uid);
        this.loadFirstPage();
    }

    onPageSizeChange(pageSize: number): void {
        this.pageSize.set(pageSize as PageSize);
        this.loadFirstPage();
    }

    goToFirstPage(): void {
        this.loadFirstPage();
    }

    onNextPage(): void {
        this.loading.set(true);
        this.pager
            .next()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    onPrevPage(): void {
        this.loading.set(true);
        this.pager
            .prev()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    openDetail(receipt: GiftCardReceipt): void {
        this.detailReceipt.set(receipt);
    }

    private loadFirstPage(): void {
        this.loading.set(true);
        this.pager = this.giftCardsService.createIssuesHistoryPager(
            this.currentFilter(),
            this.pageSize(),
        );
        this.pager
            .first()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    private applyResult(result: {
        rows: GiftCardReceipt[];
        hasNext: boolean;
        hasPrev: boolean;
        total: number;
    }): void {
        this.rows.set(result.rows);
        this.hasNext.set(result.hasNext);
        this.hasPrev.set(result.hasPrev);
        this.total.set(result.total);
        this.loading.set(false);
        this.hasLoadedOnce.set(true);
    }

    private onLoadError(): void {
        this.loading.set(false);
        this.hasLoadedOnce.set(true);
        this.toast.error('app.common.errors.general');
    }
}
