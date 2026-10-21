import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, PageSize } from '@core/data';
import { ToastService } from '@core/services';
import { normalizeGiftCardCode } from '@core/utils';
import { SAME_BARCODE_DEBOUNCE_MS } from '@shared/constants';
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
        RouterLink,
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
    readonly pageSizeOptions: PageSize[] = PAGE_SIZE_OPTIONS;

    filter = signal<GiftCardsFilter>('all');
    searchTerm = signal('');
    pageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);

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

    /**
     * Filtro de monto (ajuste posterior — corrección de bug): filtra siempre
     * por `amountCents`, nunca por el código (CLAUDE.md, "identidad ≠ monto":
     * un código histórico como `GC20-001` puede valer Bs 500 hoy).
     *
     * Causa raíz del bug original: este filtro se aplicaba SOBRE `rows()`
     * — la página que el paginador por cursores ya tenía cargada, acotada
     * por `status` server-side nada más. Con `TODAS` (sin filtro de estado)
     * esa página de 10 podía no contener ninguna tarjeta del monto buscado
     * aunque existieran en otra página, mostrando "No se encontraron
     * registros" de forma incorrecta. Con un estado específico el bug no se
     * notaba porque, a esta escala (prompt §34, "20-40 tarjetas"), todas las
     * tarjetas de ese estado suelen caber en la primera página.
     *
     * Corrección estructural (no un parche de "20 Bs"): cuando el monto está
     * activo y no es una búsqueda puntual por código, se filtra sobre
     * `summary()` — el mismo universo acotado (`limit(200)`, igual que los
     * chips de arriba) que YA se cargaba para los chips/el dropdown, en vez
     * de sobre la página del paginador. Así "TODAS + monto" ve todas las
     * tarjetas de ese monto sin importar su estado, y "ESTADO + monto" las
     * filtra también por estado — exactamente la matriz del prompt. Una
     * búsqueda por código (`singleResultMode`) sigue comprobando el monto
     * sobre esa única tarjeta encontrada, como ya hacía.
     */
    denominationFilter = signal<number | null>(null);
    readonly visibleRows = computed(() => {
        const denom = this.denominationFilter();
        if (denom === null) return this.rows();

        if (this.singleResultMode()) {
            return this.rows().filter((r) => r.amountCents === denom);
        }

        const status = this.filter();
        return this.summary().filter(
            (card) => card.amountCents === denom && (status === 'all' || card.status === status),
        );
    });

    private pager = this.giftCardsService.createPager(this.filter(), this.pageSize());
    private readonly lastLookupAt = new Map<string, number>();

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

        const now = Date.now();
        const lastAt = this.lastLookupAt.get(normalized);
        if (lastAt !== undefined && now - lastAt < SAME_BARCODE_DEBOUNCE_MS) return;
        this.lastLookupAt.set(normalized, now);

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
