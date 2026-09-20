import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { AppUser, SessionService } from '@core/session';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, PageSize } from '@core/data';
import { ToastService } from '@core/services';
import { UserFormDialogComponent } from '../user-form-dialog/user-form-dialog.component';
import { UsersFilter, UsersService } from '../../users.service';

/**
 * Listado administrativo de usuarios (plan §7, §12).
 *
 * Paginación por cursores real: nunca `getDocs()` sin límite (CLAUDE.md,
 * "Datos"). El filtro Activos/Inactivos y la búsqueda reconstruyen el
 * paginador desde la primera página — cambiar de filtro sin volver a "1" daría
 * un cursor que ya no corresponde a la consulta nueva.
 */
@Component({
    selector: 'app-user-list',
    standalone: true,
    imports: [
        CommonModule,
        TableModule,
        TagModule,
        TooltipModule,
        ButtonModule,
        TranslateModule,
        TitleBarComponent,
        SearchBarComponent,
        FilterTabComponent,
        ItemsNotFoundComponent,
        SpinnerComponent,
        CardsPaginatorComponent,
        UserFormDialogComponent,
    ],
    templateUrl: './user-list.component.html',
})
export class UserListComponent implements OnInit {
    private readonly usersService = inject(UsersService);
    private readonly sessionService = inject(SessionService);
    private readonly confirmationService = inject(ConfirmationService);
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);

    readonly filterOptions: FilterTabOption<UsersFilter>[] = [
        { label: 'app.users.filters.all', icon: 'fas fa-users', value: 'all' },
        {
            label: 'app.users.filters.active',
            icon: 'fas fa-circle-check',
            value: 'active',
        },
        {
            label: 'app.users.filters.inactive',
            icon: 'fas fa-circle-xmark',
            value: 'inactive',
        },
    ];
    readonly pageSizeOptions: PageSize[] = PAGE_SIZE_OPTIONS;

    filter = signal<UsersFilter>('all');
    searchTerm = signal('');
    pageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);

    rows = signal<AppUser[]>([]);
    total = signal(0);
    hasNext = signal(false);
    hasPrev = signal(false);
    loading = signal(false);
    /**
     * Se activa tras la primera respuesta (éxito o error) y nunca vuelve a
     * `false`. El paginador se monta cuando esto es `true` y, a partir de
     * ahí, permanece montado durante toda la vida del componente — nunca se
     * vuelve a envolver en el `@if(loading())` de abajo. Si el paginador
     * (con el `p-dropdown` de tamaño de página dentro) se destruye y se
     * recrea en cada carga, PrimeNG dispara un `ngModelChange` espurio en el
     * primer `writeValue()` de esa instancia nueva — y ese evento, al llegar
     * a `onPageSizeChange()`, vuelve a llamar `loadFirstPage()`, que pone
     * `loading` en `true`, destruye el paginador otra vez, y así
     * indefinidamente. La causa real no era ningún `effect()`: era un
     * componente con estado (el dropdown) al que la plantilla le quitaba la
     * identidad en cada ciclo.
     */
    hasLoadedOnce = signal(false);

    formVisible = signal(false);
    editingUser = signal<AppUser | null>(null);

    readonly currentUid = computed(() => {
        const session = this.sessionService.session();
        return session.status === 'active' ? session.uid : null;
    });

    private pager = this.usersService.createPager(
        this.filter(),
        this.searchTerm(),
        this.pageSize(),
    );

    ngOnInit(): void {
        this.loadFirstPage();
    }

    onFilterChange(filter: UsersFilter): void {
        this.filter.set(filter);
        this.loadFirstPage();
    }

    onSearch(term: string): void {
        this.searchTerm.set(term);
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
        this.editingUser.set(null);
        this.formVisible.set(true);
    }

    openEdit(user: AppUser): void {
        this.editingUser.set(user);
        this.formVisible.set(true);
    }

    onSaved(): void {
        this.loadFirstPage();
    }

    confirmToggleActive(user: AppUser): void {
        const activating = !user.isActive;
        this.confirmationService.confirm({
            header: this.translate.instant('app.common.confirm'),
            message: this.translate.instant(
                activating
                    ? 'app.users.messages.confirmActivate'
                    : 'app.users.messages.confirmDeactivate',
                { name: `${user.firstName} ${user.lastName}` },
            ),
            icon: activating
                ? 'fas fa-circle-check'
                : 'fas fa-triangle-exclamation',
            acceptButtonStyleClass: activating
                ? 'p-button-success'
                : 'p-button-danger',
            accept: () => this.toggleActive(user, activating),
        });
    }

    private toggleActive(user: AppUser, isActive: boolean): void {
        this.usersService.setActive(user.uid, isActive).subscribe({
            next: () => {
                this.toast.success(
                    isActive
                        ? 'app.users.messages.activated'
                        : 'app.users.messages.deactivated',
                );
                this.loadFirstPage();
            },
            error: (error) => {
                const message = (error as { message?: string })?.message;
                const code = (error as { code?: string })?.code;
                if (code?.startsWith('functions/') && message) {
                    this.toast.errorMessage(message);
                } else {
                    this.toast.error('app.common.errors.general');
                }
            },
        });
    }

    private loadFirstPage(): void {
        this.loading.set(true);
        this.pager = this.usersService.createPager(
            this.filter(),
            this.searchTerm(),
            this.pageSize(),
        );
        this.pager
            .first()
            .then((result) => this.applyResult(result))
            .catch(() => this.onLoadError());
    }

    private applyResult(result: {
        rows: AppUser[];
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
