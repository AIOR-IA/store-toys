import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { IResource, IRolePermission } from '../models';
import { IHttService } from '@core/models/http-service.interface';
import { Observable } from 'rxjs';
import { PaginatedResult, Pagination } from '@core/types';

@Injectable()
export class RolePermissionsService
    extends BaseHttpService<IRolePermission>
    implements IHttService<IRolePermission>
{
    constructor() {
        super('permissions');
    }

    override update(id: number, data: IRolePermission): Observable<IRolePermission> {
        const { roleId, resourceId } = data;
        return this.http.patch<IRolePermission>(
            `${this.apiUrl}/${this.pathContext}/${roleId}/${resourceId}`,
            data,
        );
    }

    findResources(pagination: Pagination): Observable<PaginatedResult<IResource>> {
        return this.http.get<PaginatedResult<IResource>>(
            `${this.apiUrl}/${this.pathContext}/resources`,
            {
                params: { ...pagination },
            },
        );
    }

    deleteRolePermission(roleId: number, resourceId: number ): Observable<IRolePermission> {
        return this.http.delete<IRolePermission>(`${this.apiUrl}/${this.pathContext}/${roleId}/${resourceId}`);
    }
}
