import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
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
import { SessionService } from '@core/session';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, PageSize } from '@core/data';
import { ToastService } from '@core/services';
import { dateFromKey, dateToKey, todayKeyInZone } from '@core/utils/date.util';
import { SaleDetailDialogComponent } from '../sale-detail-dialog/sale-detail-dialog.component';
import { SalesService } from '../../sales.service';
import { Sale } from '../../sale.model';

/**
 * Historial de ventas (plan §15.5, alcance Fase 4): el vendedor SOLO ve las
 * suyas del día — ni siquiera puede elegir "ver todas", porque `sellerId` va
 * siempre forzado a su propio `uid`. El admin ve cualquier día y puede
 * filtrar por vendedor. Mismo esqueleto de paginación por cursores que
 * Productos/Usuarios (`hasLoadedOnce` fuera del bloque de carga).
 */
@Component({
    selector: 'app-sales-history',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        CalendarModule,
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
    templateUrl: './sales-history.component.html',
})
export class SalesHistoryComponent implements OnInit {
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

    selectedDate = signal<Date>(new Date());
    sellerId = signal<string | null>(null);
    sellers = signal<{ uid: string; name: string }[]>([]);
    pageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);

    rows = signal<Sale[]>([]);
    total = signal(0);
    hasNext = signal(false);
    hasPrev = signal(false);
    loading = signal(false);
    hasLoadedOnce = signal(false);

    detailSale = signal<Sale | null>(null);

    private pager = this.salesService.createPager(this.currentFilter(), this.pageSize());

    ngOnInit(): void {
        this.selectedDate.set(dateFromKey(todayKeyInZone('America/La_Paz')));
        if (this.isAdmin()) {
            this.salesService.listSellers().subscribe({
                next: (sellers) => this.sellers.set(sellers),
                error: () => undefined, // el filtro de vendedor es una comodidad, no bloquea el historial
            });
        }
        this.loadFirstPage();
    }

    private currentFilter() {
        return {
            dateKey: dateToKey(this.selectedDate()),
            sellerId: this.isAdmin() ? (this.sellerId() ?? undefined) : this.currentUid(),
        };
    }

    onDateChange(date: Date): void {
        this.selectedDate.set(date);
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

    openDetail(sale: Sale): void {
        this.detailSale.set(sale);
    }

    onSaleCancelled(): void {
        this.detailSale.set(null);
        this.loadFirstPage();
    }

    /**
     * Adjuntar un voucher (Fase 5) actualiza la venta SIN recargar la
     * página completa (prompt §6): el diálogo ya volvió a leer el documento
     * fresco, así que aquí solo se propaga esa copia al detalle y a la fila
     * correspondiente del listado.
     */
    onSaleUpdated(sale: Sale): void {
        this.detailSale.set(sale);
        this.rows.update((rows) => rows.map((row) => (row.id === sale.id ? sale : row)));
    }

    hasVoucher(sale: Sale): boolean {
        return sale.payments.some((p) => p.method === 'qr' && p.voucherStatus === 'uploaded');
    }

    private loadFirstPage(): void {
        this.loading.set(true);
        this.pager = this.salesService.createPager(this.currentFilter(), this.pageSize());
        this.pager
            .first()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    private applyResult(result: {
        rows: Sale[];
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
