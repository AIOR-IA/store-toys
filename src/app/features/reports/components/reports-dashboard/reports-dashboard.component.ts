import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DividerModule } from 'primeng/divider';
import { DropdownModule } from 'primeng/dropdown';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import {
    CardsPaginatorComponent,
    ItemsNotFoundComponent,
    SpinnerComponent,
    TitleBarComponent,
} from '@shared/components/ui';
import { MoneyPipe } from '@shared/pipes';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, PageSize } from '@core/data';
import { ToastService } from '@core/services';
import {
    dateFromKey,
    dateKeyRangeToTimestampBounds,
    dateToKey,
    monthStartKey,
    shiftDateKey,
    todayKeyInZone,
} from '@core/utils/date.util';
import { SaleDetailDialogComponent } from '../../../sales/components/sale-detail-dialog/sale-detail-dialog.component';
import { PaymentMethod, Sale } from '../../../sales/sale.model';
import { SalesHistoryFilter, SalesService } from '../../../sales/sales.service';
import { GiftCardsService } from '../../../gift-cards/gift-cards.service';
import { GiftCard, GiftCardIssue, GiftCardStatus } from '../../../gift-cards/gift-card.model';
import { DailySummary } from '../../daily-summary.model';
import { ReportPdfData, ReportsPdfService } from '../../reports-pdf.service';
import { RangeTotals, ReportsService, SalesAggregateTotals, mergeDailySummaries } from '../../reports.service';

type RangePreset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'custom';

const GIFT_CARD_STATUSES: GiftCardStatus[] = ['AVAILABLE', 'ACTIVE', 'SUSPENDED', 'CANCELLED'];
const OPEN_LIABILITY_STATUSES: GiftCardStatus[] = ['ACTIVE', 'SUSPENDED'];

/**
 * `/reportes` (Fase 7, plan §18, §19, roadmap Fase 7). Todo admin-only (guard
 * en `app.routes.ts` + Rules de las cinco colecciones que lee). Un solo
 * componente orquesta el panel completo: filtros de fecha arriba, KPIs,
 * comprobación de identidades/integridad, desglose de pagos, Gift Cards,
 * productos más vendidos, ventas por vendedor, detalle del día (si aplica)
 * y exportación a PDF — el mismo layout descrito en el prompt §31.
 *
 * Camino de datos barato por defecto: `dailySummaries` del rango (plan
 * §18.3). Las únicas consultas contra `sales`/`giftCardMovements` con
 * `getAggregateFromServer` son la verificación de integridad y el desglose
 * por vendedor — nunca se descargan documentos para agregar (CLAUDE.md,
 * "Datos").
 */
@Component({
    selector: 'app-reports-dashboard',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        CalendarModule,
        CardModule,
        ChartModule,
        DividerModule,
        DropdownModule,
        TableModule,
        TagModule,
        TooltipModule,
        TranslateModule,
        MoneyPipe,
        TitleBarComponent,
        ItemsNotFoundComponent,
        SpinnerComponent,
        CardsPaginatorComponent,
        SaleDetailDialogComponent,
    ],
    templateUrl: './reports-dashboard.component.html',
})
export class ReportsDashboardComponent implements OnInit {
    private readonly reportsService = inject(ReportsService);
    private readonly reportsPdfService = inject(ReportsPdfService);
    private readonly salesService = inject(SalesService);
    private readonly giftCardsService = inject(GiftCardsService);
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);

    private readonly timezone = 'America/La_Paz'; // plan §17.2 — la misma zona fija que Ventas/Gift Cards

    readonly pageSizeOptions: PageSize[] = PAGE_SIZE_OPTIONS;

    /** No se pueden elegir fechas futuras (no hay ventas todavía). */
    readonly maxSelectableDate = dateFromKey(todayKeyInZone(this.timezone));

    // ---- Filtro de rango ----
    readonly preset = signal<RangePreset>('today');
    readonly rangeDates = signal<Date[]>(this.presetRange('today'));
    readonly fromKey = computed(() => dateToKey(this.rangeDates()[0] ?? new Date()));
    readonly toKey = computed(() => dateToKey(this.rangeDates()[1] ?? this.rangeDates()[0] ?? new Date()));
    readonly isSingleDay = computed(() => this.fromKey() === this.toKey());

    // ---- dailySummaries del rango ----
    readonly loadingSummaries = signal(false);
    readonly summaries = signal<DailySummary[]>([]);
    readonly rangeTotals = computed<RangeTotals>(() => mergeDailySummaries(this.summaries()));
    readonly topProducts = computed(() =>
        Object.values(this.rangeTotals().products).sort((a, b) => b.totalCents - a.totalCents),
    );

    readonly cashReceivedCents = computed(
        () => this.rangeTotals().cashCents + this.rangeTotals().giftCardIssuesCashCents,
    );
    readonly qrReceivedCents = computed(
        () => this.rangeTotals().qrCents + this.rangeTotals().giftCardIssuesQrCents,
    );
    readonly moneyReceivedCents = computed(() => this.cashReceivedCents() + this.qrReceivedCents());

    readonly identityMerchandiseOk = computed(() => {
        const t = this.rangeTotals();
        return t.totalCents === t.cashCents + t.qrCents + t.giftCardCents;
    });
    readonly identityReceivedOk = computed(() => {
        const t = this.rangeTotals();
        return (
            this.moneyReceivedCents() ===
            t.cashCents + t.qrCents + t.giftCardIssuesCashCents + t.giftCardIssuesQrCents
        );
    });

    // ---- Verificación de integridad (dailySummaries vs. sum() sobre sales) ----
    readonly loadingIntegrity = signal(false);
    readonly integrity = signal<SalesAggregateTotals | null>(null);
    readonly integrityMismatch = computed(() => {
        const i = this.integrity();
        if (!i) return false;
        const t = this.rangeTotals();
        return (
            i.salesCount !== t.salesCount ||
            i.totalCents !== t.totalCents ||
            i.cashCents !== t.cashCents ||
            i.qrCents !== t.qrCents ||
            i.giftCardCents !== t.giftCardCents
        );
    });

    // ---- Gift Cards: inventario/denominaciones (snapshot de HOY) + actividad del rango ----
    readonly loadingGiftCards = signal(false);
    readonly giftCards = signal<GiftCard[]>([]);
    readonly giftCardInventory = computed<Record<GiftCardStatus, number>>(() => {
        const counts = { AVAILABLE: 0, ACTIVE: 0, SUSPENDED: 0, CANCELLED: 0 } as Record<GiftCardStatus, number>;
        for (const card of this.giftCards()) counts[card.status]++;
        return counts;
    });
    readonly giftCardStatuses = GIFT_CARD_STATUSES;
    readonly giftCardDenominations = computed(() => {
        const byAmount = new Map<number, number>();
        for (const card of this.giftCards()) {
            byAmount.set(card.amountCents, (byAmount.get(card.amountCents) ?? 0) + 1);
        }
        return Array.from(byAmount.entries())
            .map(([amountCents, count]) => ({ amountCents, count }))
            .sort((a, b) => a.amountCents - b.amountCents);
    });
    readonly liabilityCents = computed(() =>
        this.giftCards()
            .filter((c) => OPEN_LIABILITY_STATUSES.includes(c.status))
            .reduce((sum, c) => sum + c.amountCents, 0),
    );

    readonly loadingGiftCardActivity = signal(false);
    readonly issuesCountInRange = signal(0);
    readonly redemptionsCountInRange = signal(0);

    // ---- Detalle de activaciones del período (paginado) ----
    readonly issuesPageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);
    readonly issuesRows = signal<GiftCardIssue[]>([]);
    readonly issuesHasNext = signal(false);
    readonly issuesHasPrev = signal(false);
    readonly issuesTotal = signal(0);
    readonly loadingIssues = signal(false);
    readonly issuesLoadedOnce = signal(false);
    private issuesPager = this.reportsService.createIssuesPager(
        this.fromKey(),
        this.toKey(),
        this.issuesPageSize(),
    );

    // ---- Ventas por vendedor ----
    readonly sellers = signal<{ uid: string; name: string }[]>([]);
    readonly selectedSellerId = signal<string | null>(null);
    readonly sellerTotals = signal<SalesAggregateTotals | null>(null);
    readonly loadingSellerTotals = signal(false);

    // ---- Detalle de ventas del día (solo si el rango es un único día) ----
    readonly dailyPageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);
    readonly dailyRows = signal<Sale[]>([]);
    readonly dailyHasNext = signal(false);
    readonly dailyHasPrev = signal(false);
    readonly dailyTotal = signal(0);
    readonly loadingDaily = signal(false);
    readonly dailyLoadedOnce = signal(false);
    readonly dailyPaymentFilter = signal<'all' | PaymentMethod>('all');
    readonly dailyPaymentOptions: { label: string; value: 'all' | PaymentMethod }[] = [
        { label: 'app.reports.dailyDetail.allMethods', value: 'all' },
        { label: 'app.sales.payment.cash', value: 'cash' },
        { label: 'app.sales.payment.qr', value: 'qr' },
        { label: 'app.sales.payment.giftcard', value: 'giftcard' },
    ];
    /**
     * Filtro de la tabla (fecha + vendedor + método) tal como viaja a Firestore.
     * El método se aplica EN LA CONSULTA —`paymentMethods array-contains`—,
     * antes de paginar: filas, conteo y cursores salen de la misma consulta.
     * `'all'` no agrega nada (misma consulta de siempre). Solo afecta a la
     * tabla del detalle: los KPIs, los totales por método y la verificación de
     * integridad salen de otras consultas y no dependen de este filtro.
     */
    private dailyFilter(): SalesHistoryFilter {
        const method = this.dailyPaymentFilter();
        return {
            dateKey: this.fromKey(),
            sellerId: this.selectedSellerId() ?? undefined,
            paymentMethod: method === 'all' ? undefined : method,
        };
    }
    private dailyPager = this.salesService.createPager(this.dailyFilter(), this.dailyPageSize());
    readonly detailSale = signal<Sale | null>(null);

    readonly exporting = signal(false);

    // ---- Gráficos (chart.js vía PrimeNG, plan §18.3, roadmap Fase 7 punto 7) ----
    readonly chartByDay = computed(() => {
        const s = this.summaries();
        return {
            labels: s.map((d) => d.dateKey),
            datasets: [
                {
                    label: this.translate.instant('app.reports.kpis.merchandiseSales'),
                    data: s.map((d) => d.totalCents / 100),
                    backgroundColor: '#6366f1',
                },
            ],
        };
    });
    readonly chartPaymentDistribution = computed(() => {
        const t = this.rangeTotals();
        return {
            labels: [
                this.translate.instant('app.sales.payment.cash'),
                this.translate.instant('app.sales.payment.qr'),
                this.translate.instant('app.sales.payment.giftcard'),
            ],
            datasets: [
                {
                    data: [t.cashCents / 100, t.qrCents / 100, t.giftCardCents / 100],
                    backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b'],
                },
            ],
        };
    });

    ngOnInit(): void {
        this.salesService.listSellers().subscribe({
            next: (sellers) => this.sellers.set(sellers),
            error: () => undefined, // el filtro de vendedor es una comodidad, no bloquea el reporte
        });
        this.loadGiftCardsSnapshot();
        this.applyRange();
    }

    private presetRange(preset: RangePreset): Date[] {
        const todayKey = todayKeyInZone(this.timezone);
        switch (preset) {
            case 'yesterday': {
                const key = shiftDateKey(todayKey, -1);
                return [dateFromKey(key), dateFromKey(key)];
            }
            case 'last7':
                return [dateFromKey(shiftDateKey(todayKey, -6)), dateFromKey(todayKey)];
            case 'thisMonth':
                return [dateFromKey(monthStartKey(todayKey)), dateFromKey(todayKey)];
            case 'today':
            default:
                return [dateFromKey(todayKey), dateFromKey(todayKey)];
        }
    }

    setPreset(preset: RangePreset): void {
        this.preset.set(preset);
        this.rangeDates.set(this.presetRange(preset));
        this.applyRange();
    }

    onCustomRangeChange(dates: Date[] | null): void {
        if (!dates || !dates[0] || !dates[1]) return;
        this.preset.set('custom');
        this.rangeDates.set(dates);
        this.applyRange();
    }

    onSellerFilterChange(uid: string | null): void {
        this.selectedSellerId.set(uid);
        this.refreshSellerTotals();
        if (this.isSingleDay()) this.loadDailyFirstPage();
    }

    /** Solo el desglose por vendedor (plan §29) — sin recargar el detalle del día, que `applyRange`/`onSellerFilterChange` ya orquestan por su cuenta. */
    private refreshSellerTotals(): void {
        const uid = this.selectedSellerId();
        if (!uid) {
            this.sellerTotals.set(null);
            return;
        }
        this.loadingSellerTotals.set(true);
        this.reportsService.getSellerTotals(uid, this.fromKey(), this.toKey()).subscribe({
            next: (totals) => {
                this.sellerTotals.set(totals);
                this.loadingSellerTotals.set(false);
            },
            error: () => {
                this.loadingSellerTotals.set(false);
                this.toast.error('app.common.errors.general');
            },
        });
    }

    /** Vuelve a consultar Firestore con el método elegido (paginador, cursores y conteo nuevos). Los KPIs no se recargan. */
    onDailyPaymentFilterChange(filter: 'all' | PaymentMethod): void {
        this.dailyPaymentFilter.set(filter);
        if (this.isSingleDay()) this.loadDailyFirstPage();
    }

    openDailyDetail(sale: Sale): void {
        this.detailSale.set(sale);
    }

    onSaleCancelled(): void {
        this.detailSale.set(null);
        this.loadDailyFirstPage();
        this.applyRange();
    }

    onSaleUpdated(sale: Sale): void {
        this.detailSale.set(sale);
        this.dailyRows.update((rows) => rows.map((row) => (row.id === sale.id ? sale : row)));
    }

    private applyRange(): void {
        const fromKey = this.fromKey();
        const toKey = this.toKey();

        this.loadingSummaries.set(true);
        this.reportsService.getSummariesInRange(fromKey, toKey).subscribe({
            next: (summaries) => {
                this.summaries.set(summaries);
                this.loadingSummaries.set(false);
            },
            error: () => {
                this.loadingSummaries.set(false);
                this.toast.error('app.common.errors.general');
            },
        });

        this.loadingIntegrity.set(true);
        this.reportsService.getSalesIntegrity(fromKey, toKey).subscribe({
            next: (integrity) => {
                this.integrity.set(integrity);
                this.loadingIntegrity.set(false);
            },
            error: () => {
                this.loadingIntegrity.set(false);
                this.toast.error('app.common.errors.general');
            },
        });

        this.loadingGiftCardActivity.set(true);
        this.reportsService.getIssuesCountInRange(fromKey, toKey).subscribe({
            next: (n) => this.issuesCountInRange.set(n),
            error: () => undefined,
        });
        const { start, end } = dateKeyRangeToTimestampBounds(fromKey, toKey, this.timezone);
        this.reportsService.getRedemptionsCountInRange(start, end).subscribe({
            next: (n) => {
                this.redemptionsCountInRange.set(n);
                this.loadingGiftCardActivity.set(false);
            },
            error: () => this.loadingGiftCardActivity.set(false),
        });

        this.refreshSellerTotals();

        this.loadIssuesFirstPage();

        if (this.isSingleDay()) {
            this.loadDailyFirstPage();
        } else {
            this.dailyRows.set([]);
            this.dailyLoadedOnce.set(false);
        }
    }

    private loadGiftCardsSnapshot(): void {
        this.loadingGiftCards.set(true);
        this.giftCardsService.listAllForSummary().subscribe({
            next: (cards) => {
                this.giftCards.set(cards);
                this.loadingGiftCards.set(false);
            },
            error: () => {
                this.loadingGiftCards.set(false);
                this.toast.error('app.common.errors.general');
            },
        });
    }

    reloadGiftCardsSnapshot(): void {
        this.loadGiftCardsSnapshot();
    }

    // ---- Paginador de activaciones del período ----

    loadIssuesFirstPage(): void {
        this.loadingIssues.set(true);
        this.issuesPager = this.reportsService.createIssuesPager(
            this.fromKey(),
            this.toKey(),
            this.issuesPageSize(),
        );
        this.issuesPager
            .first()
            .then((result) => {
                this.issuesRows.set(result.rows);
                this.issuesHasNext.set(result.hasNext);
                this.issuesHasPrev.set(result.hasPrev);
                this.issuesTotal.set(result.total);
                this.loadingIssues.set(false);
                this.issuesLoadedOnce.set(true);
            })
            .catch(() => {
                this.loadingIssues.set(false);
                this.issuesLoadedOnce.set(true);
                this.toast.error('app.common.errors.general');
            });
    }

    onIssuesNextPage(): void {
        this.loadingIssues.set(true);
        this.issuesPager.next().then((result) => {
            this.issuesRows.set(result.rows);
            this.issuesHasNext.set(result.hasNext);
            this.issuesHasPrev.set(result.hasPrev);
            this.loadingIssues.set(false);
        });
    }

    onIssuesPrevPage(): void {
        this.loadingIssues.set(true);
        this.issuesPager.prev().then((result) => {
            this.issuesRows.set(result.rows);
            this.issuesHasNext.set(result.hasNext);
            this.issuesHasPrev.set(result.hasPrev);
            this.loadingIssues.set(false);
        });
    }

    onIssuesPageSizeChange(pageSize: number): void {
        this.issuesPageSize.set(pageSize as PageSize);
        this.loadIssuesFirstPage();
    }

    issueCashCents(issue: GiftCardIssue): number {
        return issue.payments.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amountCents, 0);
    }

    issueQrCents(issue: GiftCardIssue): number {
        return issue.payments.filter((p) => p.method === 'qr').reduce((sum, p) => sum + p.amountCents, 0);
    }

    // ---- Paginador del detalle de ventas del día ----

    /**
     * Primera página de la consulta ACTUAL (fecha + vendedor + método): crea un
     * paginador nuevo —cursores y conteo desde cero—. Si mientras tanto se
     * creó otro (p. ej. cambios seguidos de filtro), la respuesta del anterior
     * se descarta para que no pise a la más reciente.
     */
    loadDailyFirstPage(): void {
        this.loadingDaily.set(true);
        const pager = this.salesService.createPager(this.dailyFilter(), this.dailyPageSize());
        this.dailyPager = pager;
        pager
            .first()
            .then((result) => {
                if (pager !== this.dailyPager) return;
                this.dailyRows.set(result.rows);
                this.dailyHasNext.set(result.hasNext);
                this.dailyHasPrev.set(result.hasPrev);
                this.dailyTotal.set(result.total);
                this.loadingDaily.set(false);
                this.dailyLoadedOnce.set(true);
            })
            .catch(() => {
                if (pager !== this.dailyPager) return;
                // Nunca dejar a la vista filas de OTRA consulta bajo el filtro elegido
                // (p. ej. si el índice del filtro aún no está desplegado).
                this.dailyRows.set([]);
                this.dailyHasNext.set(false);
                this.dailyHasPrev.set(false);
                this.dailyTotal.set(0);
                this.loadingDaily.set(false);
                this.dailyLoadedOnce.set(true);
                this.toast.error('app.common.errors.general');
            });
    }

    onDailyNextPage(): void {
        this.loadingDaily.set(true);
        const pager = this.dailyPager;
        pager.next().then((result) => {
            if (pager !== this.dailyPager) return;
            this.dailyRows.set(result.rows);
            this.dailyHasNext.set(result.hasNext);
            this.dailyHasPrev.set(result.hasPrev);
            this.loadingDaily.set(false);
        });
    }

    onDailyPrevPage(): void {
        this.loadingDaily.set(true);
        const pager = this.dailyPager;
        pager.prev().then((result) => {
            if (pager !== this.dailyPager) return;
            this.dailyRows.set(result.rows);
            this.dailyHasNext.set(result.hasNext);
            this.dailyHasPrev.set(result.hasPrev);
            this.loadingDaily.set(false);
        });
    }

    onDailyPageSizeChange(pageSize: number): void {
        this.dailyPageSize.set(pageSize as PageSize);
        this.loadDailyFirstPage();
    }

    async exportPdf(): Promise<void> {
        this.exporting.set(true);
        const sellerId = this.selectedSellerId();
        const sellerName = sellerId ? this.sellers().find((s) => s.uid === sellerId)?.name ?? '' : '';
        const sellerScope: ReportPdfData['sellerScope'] =
            sellerId && this.sellerTotals() ? { name: sellerName, totals: this.sellerTotals()! } : null;

        try {
            await this.reportsPdfService.export({
                fromKey: this.fromKey(),
                toKey: this.toKey(),
                rangeTotals: this.rangeTotals(),
                cashReceivedCents: this.cashReceivedCents(),
                qrReceivedCents: this.qrReceivedCents(),
                moneyReceivedCents: this.moneyReceivedCents(),
                integrity: this.integrity(),
                integrityMismatch: this.integrityMismatch(),
                giftCardInventory: this.giftCardInventory(),
                giftCardDenominations: this.giftCardDenominations(),
                liabilityCents: this.liabilityCents(),
                issuesCountInRange: this.issuesCountInRange(),
                redemptionsCountInRange: this.redemptionsCountInRange(),
                topProducts: this.topProducts(),
                sellerScope,
            });
        } catch {
            this.toast.error('app.common.errors.general');
        } finally {
            this.exporting.set(false);
        }
    }
}
