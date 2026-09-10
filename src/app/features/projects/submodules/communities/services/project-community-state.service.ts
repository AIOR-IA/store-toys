import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { IProjectCommunity } from '../models/project-community.interface';
import { ProjectCommunityService } from './project-community.service';

@Injectable({ providedIn: 'root' })
export class ProjectCommunityStateService extends BaseStateService<IProjectCommunity> {

    constructor() {
        super(ProjectCommunityService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
