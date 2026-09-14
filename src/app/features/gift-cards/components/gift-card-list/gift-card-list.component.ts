import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { FormsModule } from '@angular/forms';
import {
    FilterTabComponent,
    FilterTabOption,
    ItemsNotFoundComponent,
    SearchBarComponent,
    SpinnerComponent,
    TitleBarComponent,
    CardsPaginatorComponent,
} from '@shared/components/ui';
import { MoneyPipe } from '@shared/pipes';
import { SessionService } from '@core/session';
import { PageSize } from '@core/data';
import { ToastService } from '@core/services';
import { normalizeGiftCardCode } from '@core/utils';
import { GiftCardRegisterDialogComponent } from '../gift-card-register-dialog/gift-card-register-dialog.component';
import { GiftCardDetailDialogComponent } from '../gift-card-detail-dialog/gift-card-detail-dialog.component';
import { GiftCardsFilter, GiftCardsService } from '../../gift-cards.service';
import { GiftCard, GiftCardStatus } from '../../gift-card.model';

/**
 * Listado de Gift Cards (Fase 6, plan §16, prompt §32, §34): mismo esqueleto
 * de paginación por cursores que Productos/Usuarios, filtrado por estado.
 * Denominación y comprador se refinan en el cliente sobre la página ya
 * cargada (prompt §34: "no hace falta sobreoptimizar" con 20-40 tarjetas).
 */
@Component({
    selector: 'app-gift-card-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        TagModule,
        ButtonModule,
        DropdownModule,
        TranslateModule,
        MoneyPipe,
        TitleBarComponent,
        SearchBarComponent,
        FilterTabComponent,
        ItemsNotFoundComponent,
        SpinnerComponent,
        CardsPaginatorComponent,
        GiftCardRegisterDialogComponent,
        GiftCardDetailDialogComponent,
    ],
    templateUrl: './gift-card-list.component.html',
})
export class GiftCardListComponent implements OnInit {
    private readonly giftCardsService = inject(GiftCardsService);
    private readonly sessionService = inject(SessionService);
    private readonly toast = inject(ToastService);

    readonly filterOptions: FilterTabOption<GiftCardsFilter>[] = [
        { label: 'app.giftCards.filters.all', icon: 'fas fa-gift', value: 'all' },
        {
            label: 'app.giftCards.status.available',
            icon: 'fas fa-circle-check',
            value: 'AVAILABLE',
        },
        { label: 'app.giftCards.status.active', icon: 'fas fa-bolt', value: 'ACTIVE' },
        {
            label: 'app.giftCards.status.suspended',
            icon: 'fas fa-triangle-exclamation',
            value: 'SUSPENDED',
        },
        {
            label: 'app.giftCards.status.cancelled',
            icon: 'fas fa-ban',
            value: 'CANCELLED',
        },
    ];
    readonly pageSizeOptions: PageSize[] = [10, 20, 50];

    filter = signal<GiftCardsFilter>('all');
    searchTerm = signal('');
    pageSize = signal<PageSize>(20);

    rows = signal<GiftCard[]>([]);
    total = signal(0);
    hasNext = signal(false);
    hasPrev = signal(false);
    loading = signal(false);
    hasLoadedOnce = signal(false);
    /** true cuando `rows` viene de un lookup exacto por código, no del paginador. */
    singleResultMode = signal(false);

    summary = signal<GiftCard[]>([]);

    registerVisible = signal(false);
    detailCard = signal<GiftCard | null>(null);

    readonly isAdmin = computed(() => {
        const session = this.sessionService.session();
        return session.status === 'active' && session.role === 'admin';
    });

    /** Denominaciones distintas conocidas, para el filtro y el resumen (prompt §2, §15). */
    readonly denominations = computed(() =>
        Array.from(new Set(this.summary().map((c) => c.amountCents))).sort((a, b) => a - b),
    );
    readonly statusCounts = computed(() => {
        const counts: Record<GiftCardStatus, number> = {
            AVAILABLE: 0,
            ACTIVE: 0,
            SUSPENDED: 0,
            CANCELLED: 0,
        };
        for (const card of this.summary()) counts[card.status]++;
        return counts;
    });
    /** Solo disponibles, agrupadas por denominación (prompt §2: "100 Bs → Disponibles: 6"). */
    readonly availableByDenomination = computed(() => {
        const map = new Map<number, number>();
        for (const card of this.summary()) {
            if (card.status !== 'AVAILABLE') continue;
            map.set(card.amountCents, (map.get(card.amountCents) ?? 0) + 1);
        }
        return Array.from(map, ([amountCents, count]) => ({ amountCents, count })).sort(
            (a, b) => a.amountCents - b.amountCents,
        );
    });

    /** Filtro de denominación aplicado SOBRE la página ya cargada (prompt §34). */
    denominationFilter = signal<number | null>(null);
    readonly visibleRows = computed(() => {
        const denom = this.denominationFilter();
        const rows = this.rows();
        if (denom === null) return rows;
        return rows.filter((r) => r.amountCents === denom);
    });

    private pager = this.giftCardsService.createPager(this.filter(), this.pageSize());

    ngOnInit(): void {
        this.loadFirstPage();
        this.loadSummary();
    }

    private loadSummary(): void {
        this.giftCardsService.listAllForSummary().subscribe({
            next: (cards) => this.summary.set(cards),
            error: () => undefined,
        });
    }

    onFilterChange(filter: GiftCardsFilter): void {
        this.filter.set(filter);
        this.searchTerm.set('');
        this.denominationFilter.set(null);
        this.singleResultMode.set(false);
        this.loadFirstPage();
    }

    onDenominationChange(amountCents: number | null): void {
        this.denominationFilter.set(amountCents);
    }

    onSearch(term: string): void {
        this.searchTerm.set(term);
        const normalized = normalizeGiftCardCode(term);

        if (!normalized) {
            this.singleResultMode.set(false);
            this.loadFirstPage();
            return;
        }

        this.loading.set(true);
        this.giftCardsService.lookupByCode(normalized).subscribe({
            next: (card) => {
                if (card) {
                    this.rows.set([card]);
                    this.total.set(1);
                    this.hasNext.set(false);
                    this.hasPrev.set(false);
                    this.singleResultMode.set(true);
                    this.loading.set(false);
                    this.hasLoadedOnce.set(true);
                } else {
                    this.singleResultMode.set(false);
                    this.loadFirstPage();
                }
            },
            error: () => this.onLoadError(),
        });
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

    openRegister(): void {
        this.registerVisible.set(true);
    }

    onRegistered(): void {
        this.singleResultMode.set(false);
        this.loadFirstPage();
        this.loadSummary();
        this.toast.success('app.giftCards.messages.registered');
    }

    openDetail(card: GiftCard): void {
        this.detailCard.set(card);
    }

    onDetailChanged(): void {
        this.singleResultMode.set(false);
        this.loadFirstPage();
        this.loadSummary();
    }

    private loadFirstPage(): void {
        this.loading.set(true);
        this.pager = this.giftCardsService.createPager(this.filter(), this.pageSize());
        this.pager
            .first()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    private applyResult(result: {
        rows: GiftCard[];
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
