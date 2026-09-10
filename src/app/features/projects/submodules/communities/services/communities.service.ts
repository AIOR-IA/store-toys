import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { ICommunity } from '../models';
import { IHttService } from '@core/models/http-service.interface';
import { Observable } from 'rxjs';

@Injectable()
export class CommunityService
    extends BaseHttpService<ICommunity>
    implements IHttService<ICommunity>
{
    constructor() {
        super('communities');
    }

    createInProject(projectId: number, dto: Partial<ICommunity>): Observable<ICommunity> {
    return this.http.post<ICommunity>(
      `${this.apiUrl}/${this.pathContext}/projects/${projectId}`,
      dto
    );
  }
}
