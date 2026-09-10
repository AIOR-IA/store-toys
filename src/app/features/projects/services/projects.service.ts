import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { IProject } from '../models';
import { IHttService } from '@core/models/http-service.interface';
import { Observable } from 'rxjs';
import { ICommunity } from '../submodules/communities/models/communities.interface';
import { IDashboardResponse } from '../models/dashboard-response.interface';

@Injectable()
export class ProjectService
    extends BaseHttpService<IProject>
    implements IHttService<IProject> {
    constructor() {
        super('projects');
    }

    findByProjectId(projectId: number): Observable<{ data: ICommunity[] }> {
        return this.http.get<{ data: ICommunity[] }>(`${this.apiUrl}/${this.pathContext}/${projectId}/communities`);
    }

    getDashboard(projectId: number, communityId?: number): Observable<IDashboardResponse> {
        const params: any = { projectId };
        if (communityId) params.communityId = communityId;

        return this.http.get<IDashboardResponse>(
            `${this.apiUrl}/${this.pathContext}/dashboard`,
            { params }
        );
    }

    exportDashboardExcel(projectId: number, communityId?: number): Observable<Blob> {
        const params: any = { projectId };
        if (communityId) params.communityId = communityId;

        return this.http.get(
            `${this.apiUrl}/${this.pathContext}/dashboard/export/excel`,
            {
                params,
                responseType: 'blob' as 'blob',
            }
        );
    }
}
