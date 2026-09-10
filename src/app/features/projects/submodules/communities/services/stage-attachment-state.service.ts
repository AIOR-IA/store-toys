import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { StageAttachmentService } from './stage-attachment.service';
import { IStageAttachment } from '../models/stage-attachment.interface';

@Injectable({ providedIn: 'root' })
export class StageAttachmentStateService extends BaseStateService<IStageAttachment> {

    constructor() {
        super(StageAttachmentService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
