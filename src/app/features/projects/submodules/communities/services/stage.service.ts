import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { IStage, SahtosoStageEnum } from '../models';
import { IHttService } from '@core/models/http-service.interface';
import { Observable } from 'rxjs';
import { IAttachment } from '../../../../../core/models/attachment.interface';
import { IStageAttachment } from '../models/stage-attachment.interface';

@Injectable({ providedIn: 'root' })
export class StageService
    extends BaseHttpService<IStage>
    implements IHttService<IStage> {
    constructor() {
        super('stages');
    }

    findByProjectCommunityAndCode(projectCommunityId: number, code: SahtosoStageEnum) {
        return this.http.get<IStage>(`${this.apiUrl}/${this.pathContext}/by-project-community`, {
            params: { projectCommunityId, code },
        });
    }

    findImagesByCommunity(communityId: number): Observable<IStageAttachment[]> {
        return this.http.get<IStageAttachment[]>(
            `${this.apiUrl}/${this.pathContext}/communities/${communityId}/images`
        );
    }
}
