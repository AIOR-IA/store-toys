import { Inject, Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { FlowStatus, PaginatedResult, Pagination } from '@core/types';
import { IHttService } from '@core/models/http-service.interface';

@Injectable()
export class BaseHttpService<T> implements IHttService<T> {
    pathContext!: string;
    http = inject(HttpClient);
    apiUrl = environment.API_URL;

    constructor(@Inject(String) _path: string) {
        this.pathContext = _path;
    }

    findAll(pagination: Pagination): Observable<PaginatedResult<T>> {
        return this.http.get<PaginatedResult<T>>(
            `${this.apiUrl}/${this.pathContext}`,
            {
                params: { ...pagination },
            }
        );
    }

    findOne(id: number, params?: any): Observable<T> {
        return this.http.get<T>(`${this.apiUrl}/${this.pathContext}/${id}`, { params });
    }

    findByUuid(uuid: string, params?: any): Observable<T> {
        return this.http.get<T>(
            `${this.apiUrl}/${this.pathContext}/uuid/${uuid}`,
            { params }
        );
    }

    create(data: T): Observable<T> {
        return this.http.post<T>(`${this.apiUrl}/${this.pathContext}`, data);
    }

    update(id: number, data: T): Observable<T> {
        return this.http.patch<T>(
            `${this.apiUrl}/${this.pathContext}/${id}`,
            data
        );
    }

    delete(id: number): Observable<T> {
        return this.http.delete<T>(`${this.apiUrl}/${this.pathContext}/${id}`);
    }

    validateFieldUniqueness(
        field: keyof T,
        value: T[keyof T]
    ): Observable<boolean> {
        return this.http.head<boolean>(
            `${this.apiUrl}/${
                this.pathContext
            }/fields/validate-uniqueness?field=${String(field)}&value=${value}`
        );
    }

    changeFlowStatus(id: number, status: FlowStatus): Observable<T> {
        return this.http.patch<T>(
            `${this.apiUrl}/${this.pathContext}/${id}/flow-status`,
            { id, flowStatus: status }
        );
    }
}
