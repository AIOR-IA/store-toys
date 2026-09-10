import { WritableSignal } from '@angular/core';
import { Pagination, PaginatedResult, ApiErrorResponseType } from '@core/types';
import { Observable, Subject } from 'rxjs';

export interface IBaseStateService<T> {
    parsePagination(event: any): Pagination;
    initializeLoadItemsBehaviour(): void;
    findNextPage(): Promise<void>;
    findPreviousPage(): Promise<void>;
    findPage(pagination: Partial<Pagination>): Promise<void>;
    findItem(uuid: string): void;
    reload(): Promise<void>;
    reloadItem(): Promise<void>;
    readonly items: T[];
    readonly current: T;
    readonly meta: any;
    readonly pagination: Pagination;
    changePage$: Subject<Pagination>;
    changeItem$: Subject<string | number>;
    loadItems$: Observable<any>;
    resources: any;
    actions: any;
    error: WritableSignal<ApiErrorResponseType>;
}
