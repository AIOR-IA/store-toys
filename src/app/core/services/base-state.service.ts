import {
    computed,
    inject,
    Signal,
    signal,
    WritableSignal,
} from '@angular/core';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Subject } from 'rxjs';
import {
    ApiErrorResponseType,
    DEFAULT_PAGES,
    PaginatedResult,
    Pagination,
    SystemAccessPermissions,
} from '@core/types';
import { IBaseStateService, State } from '@core/models';
import { IHttService } from '@core/models/http-service.interface';
import { RESOURCES } from '@shared/constants';

export abstract class BaseStateService<T> implements IBaseStateService<T> {
    protected readonly service: IHttService<T>;
    protected initialState: State<T> = {
        items: {
            data: [],
            meta: {
                total: 0,
                lastPage: 0,
                page: 0,
                perPage: 0,
                prev: null,
                next: null,
            },
        } as PaginatedResult<T>,
        current: null,
        status: 'idle' as const,
    };
    protected initialPagination: Pagination = {
        page: 1,
        perPage: DEFAULT_PAGES,
        sort: 'id',
        order: 'asc',
    };
    public pagination!: Pagination;
    public state: WritableSignal<State<T>> = signal(this.initialState);
    public changePage$: Subject<Pagination>;
    public loadItems$: any;
    public changeItem$: Subject<string | number>;
    public loadItem$: any;
    public resources = RESOURCES;
    public actions = {
        create: SystemAccessPermissions.CAN_CREATE,
        update: SystemAccessPermissions.CAN_UPDATE,
        delete: SystemAccessPermissions.CAN_DELETE,
        read: SystemAccessPermissions.CAN_READ,
        manage: SystemAccessPermissions.CAN_MANAGE,
        master: SystemAccessPermissions.CAN_MASTER,
        none: SystemAccessPermissions.NONE,
    };
    public error = signal({} as ApiErrorResponseType);
    constructor(_service: any, _pagination?: Pagination) {
        this.service = inject(_service);
        this.pagination = { ...this.initialPagination };

        this.pagination.page = _pagination?.page || this.initialPagination.page;
        this.pagination.perPage =
            _pagination?.perPage || this.initialPagination.perPage;
        this.pagination.sort = _pagination?.sort || this.initialPagination.sort;
        this.pagination.order =
            _pagination?.order || this.initialPagination.order;
        if (_pagination?.filter) {
            this.pagination.filter = JSON.stringify(_pagination?.filter);
        }

        this.changePage$ = new Subject<Pagination>();
        this.changeItem$ = new Subject<string | number>();

        this.initializeLoadItemsBehaviour();
        this.initializeLoadCurrentItemBehaviour();
    }

    initializeLoadItemsBehaviour() {
        this.loadItems$ = this.changePage$.pipe(
            switchMap((pagination: Pagination) => {
                this.set('status', 'loading');
                return this.service.findAll(pagination);
            }),
            map((response) => {
                return {
                    ...this.state(),
                    items: response,
                    status: 'success' as const,
                };
            }),
            catchError(() => [
                {
                    ...this.state(),
                    items: this.initialState.items,
                    status: 'error' as const,
                },
            ]),
        );
        this.loadItems$.subscribe((response: any) => {
            this.setState(response);
        });
    }

    initializeLoadCurrentItemBehaviour() {
        this.loadItem$ = this.changeItem$.pipe(
            switchMap((uuid: string | number) => {
                const isNumeric = !isNaN(Number(uuid));
                if (isNumeric) {
                    return this.service.findOne(uuid as number);
                }
                return this.service.findByUuid(uuid as string);
            }),
            map((response: T) => ({
                ...this.state(),
                current: response as T,
                status: 'success' as const,
            })),
            catchError(() => [
                {
                    ...this.state(),
                    current: null,
                    status: 'error' as const,
                },
            ]),
        );
        this.loadItem$.subscribe((response: any) => {
            this.setState(response);
        });
    }

    async reload() {
        const { page } = this.state().items.meta;
        this.pagination.page = page || this.initialPagination.page;
        this.changePage$.next(this.pagination);
    }

    async findNextPage() {
        const { page } = this.state().items.meta;
        this.pagination.page = page + 1;

        this.changePage$.next(this.pagination);
    }

    async findPreviousPage() {
        const { page } = this.state().items.meta;
        this.pagination.page = page - 1;

        this.changePage$.next(this.pagination);
    }

    async findPage(pagination: Partial<Pagination>) {
        if (pagination.filter) {
            if (typeof pagination.filter !== 'string') {
                pagination.filter = JSON.stringify(pagination.filter);
            }
        }
        this.pagination = {
            ...this.pagination,
            ...Object.fromEntries(
                Object.entries(pagination).filter(([_, v]) => v !== undefined),
            ),
        };

        this.changePage$.next(this.pagination);
    }

    async findItem(uuid: string, id?: number) {
        if (id) {
            this.changeItem$.next(id as number);
            return;
        }
        this.changeItem$.next(uuid as string);
    }
    async reloadItem() {
        const { uuid } = this.state().current as any;
        this.changeItem$.next(uuid as string);
    }

    async cleanCurrentItem() {
        this.set('current', null);
    }

    setCurrentItem(item: T) {
        this.set('current', item);
    }

    parsePagination(event: any): Pagination {
        const page = event.first / event.rows + 1;
        const current = this.pagination;
        let sortField = current.sort;
        let sortOrder = current.order;
        if (event.sortField) {
            sortField = event.sortField;
            sortOrder = event.sortOrder === 1 ? 'asc' : 'desc';
        }
        return {
            page,
            perPage: event.rows,
            sort: sortField,
            order: sortOrder,
        };
    }

    get loading(): boolean {
        return this.state().status === 'loading';
    }

    get meta() {
        const _meta: any = this.state().items.meta;
        _meta.first = (_meta.page - 1) * _meta.perPage;
        return _meta;
    }

    get items() {
        return this.state().items.data as T[];
    }

    get current(): T {
        return this.state().current || ({} as T);
    }

    get hasNextPage(): boolean {
        return !!this.state().items.meta.next;
    }

    get hasPreviousPage(): boolean {
        return !!this.state().items.meta.prev;
    }


    /**
     * Returns a reactive value for a property on the state.
     * This is used when the consumer needs the signal for
     * specific part of the state.
     *
     * @param key - the key of the property to be retrieved
     */
    public select<K extends keyof State<T>>(key: K): Signal<State<T>[K]> {
        return computed(() => this.state()[key]);
    }

    /**
     * This is used to set a new value for a property
     *
     * @param key - the key of the property to be set
     * @param data - the new data to be saved
     */
    public set<K extends keyof State<T>>(key: K, data: State<T>[K]) {
        this.state.update((currentValue) => ({ ...currentValue, [key]: data }));
    }

    /**
     * Sets values for multiple properties on the store
     * This is used when there is a need to update multiple
     * properties in the store
     *
     * @param partialState - the partial state that includes
     *                      the new value to be saved
     */
    public setState(partialState: Partial<State<T>>): void {
        this.state.update((currentValue) => {
            return {
                ...currentValue,
                ...partialState,
            };
        });
    }
}
