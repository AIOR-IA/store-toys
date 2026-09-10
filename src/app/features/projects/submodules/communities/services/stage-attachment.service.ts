import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { IHttService } from '@core/models/http-service.interface';
import { IStageAttachment } from '../models/stage-attachment.interface';
import { UpsertStageAttachmentDto } from '../models/upser-stage-attachment.interface';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StageAttachmentService
    extends BaseHttpService<IStageAttachment>
    implements IHttService<IStageAttachment> {
    constructor() {
        super('stage-attachments');
    }

    upsert(dto: UpsertStageAttachmentDto): Observable<IStageAttachment> {
        return this.http.post<IStageAttachment>(
            `${this.apiUrl}/${this.pathContext}/upsert`,
            dto
        );
    }

    // removeByStageAndTag(stageId: number, tag: string) {
    //     return this.http.delete(
    //         `${this.apiUrl}/${this.pathContext}`,
    //         { params: { stageId, tag } }
    //     );
    // }

}
