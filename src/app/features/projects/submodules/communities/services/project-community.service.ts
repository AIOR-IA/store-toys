import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { ICommunity, IProjectCommunity } from '../models';
import { IHttService } from '@core/models/http-service.interface';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProjectCommunityService
    extends BaseHttpService<IProjectCommunity>
    implements IHttService<IProjectCommunity> {
    constructor() {
        super('project-communities');
    }

    findByProjectAndCommunity(projectId: number, communityId: number) {
        return this.http.get(`${this.apiUrl}/${this.pathContext}/by-project-community`, {
            params: { projectId, communityId },
        });
    }
}
