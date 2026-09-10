import { FlowStatus, PaginatedResult, Pagination } from '@core/types';
import { Observable } from 'rxjs';

export interface IHttService<T> {
    pathContext: string;
    findAll(pagination: Pagination): Observable<PaginatedResult<T>>;
    findOne(id: number): Observable<T>;
    findByUuid(uuid: string): Observable<T>;
    create(data: T): Observable<T>;
    update(id: number, data: T): Observable<T>;
    delete(id: number): Observable<T>;
    validateFieldUniqueness(
        field: keyof T,
        value: T[keyof T],
    ): Observable<boolean>;
    changeFlowStatus(id: number, status: FlowStatus): Observable<T>;
    [key: string]: any; // Support for additional methods
}
