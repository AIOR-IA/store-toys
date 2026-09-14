import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import {
    CardsPaginatorComponent,
    FilterTabComponent,
    FilterTabOption,
    ItemsNotFoundComponent,
    SearchBarComponent,
    SpinnerComponent,
    TitleBarComponent,
} from '@shared/components/ui';
import { MoneyPipe } from '@shared/pipes';
import { SessionService } from '@core/session';
import { PageSize } from '@core/data';
import { SettingsService, ToastService } from '@core/services';
import { looksLikeCode } from '@core/utils';
import { ProductFormDialogComponent } from '../product-form-dialog/product-form-dialog.component';
import { ProductLabelDialogComponent } from '../product-label-dialog/product-label-dialog.component';
import { ProductChangeCodeDialogComponent } from '../product-change-code-dialog/product-change-code-dialog.component';
import { ProductsFilter, ProductsService } from '../../products.service';
import { Product } from '../../product.model';

const DEFAULT_LOW_STOCK_THRESHOLD = 3;

/**
 * Listado de productos (plan §12, §13). Mismo esqueleto de paginación por
 * cursores que Usuarios (Fase 2) — incluido `hasLoadedOnce`, que evita el
 * loop del `p-dropdown` de tamaño de página al montar/desmontar el
 * paginador en cada carga (ver comentario en el template).
 *
 * La búsqueda por código (plan §14.1) NO pasa por el paginador: resuelve
 * `barcodes/{code}` en una lectura y muestra ese único producto. Solo si el
 * término no calza como código cae al camino normal de nombre.
 */
@Component({
    selector: 'app-product-list',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        TableModule,
        TagModule,
        TooltipModule,
        ButtonModule,
        TranslateModule,
        MoneyPipe,
        TitleBarComponent,
        SearchBarComponent,
        FilterTabComponent,
        ItemsNotFoundComponent,
        SpinnerComponent,
        CardsPaginatorComponent,
        ProductFormDialogComponent,
        ProductLabelDialogComponent,
        ProductChangeCodeDialogComponent,
    ],
    templateUrl: './product-list.component.html',
})
export class ProductListComponent implements OnInit {
    private readonly productsService = inject(ProductsService);
    private readonly settingsService = inject(SettingsService);
    private readonly sessionService = inject(SessionService);
    private readonly confirmationService = inject(ConfirmationService);
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);

    readonly filterOptions: FilterTabOption<ProductsFilter>[] = [
        { label: 'app.products.filters.all', icon: 'fas fa-cubes', value: 'all' },
        {
            label: 'app.products.filters.active',
            icon: 'fas fa-circle-check',
            value: 'active',
        },
        {
            label: 'app.products.filters.inactive',
            icon: 'fas fa-circle-xmark',
            value: 'inactive',
        },
        {
            label: 'app.products.filters.lowStock',
            icon: 'fas fa-triangle-exclamation',
            value: 'lowStock',
        },
    ];
    readonly pageSizeOptions: PageSize[] = [10, 20, 50];

    filter = signal<ProductsFilter>('all');
    searchTerm = signal('');
    pageSize = signal<PageSize>(20);
    lowStockThreshold = signal(DEFAULT_LOW_STOCK_THRESHOLD);

    rows = signal<Product[]>([]);
    total = signal(0);
    hasNext = signal(false);
    hasPrev = signal(false);
    loading = signal(false);
    hasLoadedOnce = signal(false);
    /** true cuando `rows` viene de un lookup exacto por código, no del paginador. */
    singleResultMode = signal(false);

    formVisible = signal(false);
    editingProduct = signal<Product | null>(null);
    labelProduct = signal<Product | null>(null);
    changeCodeProduct = signal<Product | null>(null);

    readonly isAdmin = computed(() => {
        const session = this.sessionService.session();
        return session.status === 'active' && session.role === 'admin';
    });
    /** Búsqueda deshabilitada en "Stock bajo": ese filtro ya usa `orderBy('stock')`,
     * y Firestore no permite combinar ese rango con el rango de `nameLower`. */
    readonly searchDisabled = computed(() => this.filter() === 'lowStock');

    private pager = this.productsService.createPager(
        this.filter(),
        this.searchTerm(),
        this.pageSize(),
        this.lowStockThreshold(),
    );

    ngOnInit(): void {
        this.settingsService.getSettings().subscribe((settings) => {
            this.lowStockThreshold.set(settings.lowStockThreshold);
        });
        this.loadFirstPage();
    }

    onFilterChange(filter: ProductsFilter): void {
        this.filter.set(filter);
        this.searchTerm.set('');
        this.singleResultMode.set(false);
        this.loadFirstPage();
    }

    onSearch(term: string): void {
        this.searchTerm.set(term);

        if (looksLikeCode(term)) {
            this.loading.set(true);
            this.productsService.lookupByCode(term).subscribe({
                next: (product) => {
                    if (product) {
                        this.rows.set([product]);
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
            return;
        }

        this.singleResultMode.set(false);
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

    openCreate(): void {
        this.editingProduct.set(null);
        this.formVisible.set(true);
    }

    openEdit(product: Product): void {
        this.editingProduct.set(product);
        this.formVisible.set(true);
    }

    openLabel(product: Product): void {
        this.labelProduct.set(product);
    }

    openChangeCode(product: Product): void {
        this.changeCodeProduct.set(product);
    }

    onSaved(): void {
        this.singleResultMode.set(false);
        this.loadFirstPage();
    }

    confirmToggleActive(product: Product): void {
        const activating = !product.isActive;
        this.confirmationService.confirm({
            header: this.translate.instant('app.common.confirm'),
            message: this.translate.instant(
                activating
                    ? 'app.products.messages.confirmActivate'
                    : 'app.products.messages.confirmDeactivate',
                { name: product.name },
            ),
            icon: activating
                ? 'fas fa-circle-check'
                : 'fas fa-triangle-exclamation',
            acceptButtonStyleClass: activating
                ? 'p-button-success'
                : 'p-button-danger',
            accept: () => this.toggleActive(product, activating),
        });
    }

    private toggleActive(product: Product, isActive: boolean): void {
        this.productsService.setActive(product.id, isActive).subscribe({
            next: () => {
                this.toast.success(
                    isActive
                        ? 'app.products.messages.activated'
                        : 'app.products.messages.deactivated',
                );
                this.loadFirstPage();
            },
            error: () => this.toast.error('app.common.errors.general'),
        });
    }

    private loadFirstPage(): void {
        this.loading.set(true);
        this.pager = this.productsService.createPager(
            this.filter(),
            this.searchTerm(),
            this.pageSize(),
            this.lowStockThreshold(),
        );
        this.pager
            .first()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    private applyResult(result: {
        rows: Product[];
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
