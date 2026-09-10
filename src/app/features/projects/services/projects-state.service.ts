import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { IProject } from '../models';
import { ProjectService } from './projects.service';

@Injectable({ providedIn: 'root' })
export class ProjectStateService extends BaseStateService<IProject> {

    constructor() {
        super(ProjectService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
