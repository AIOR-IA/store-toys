import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { IStage } from '../models';
import { StageService } from './stage.service';

@Injectable({ providedIn: 'root' })
export class StageStateService extends BaseStateService<IStage> {

    constructor() {
        super(StageService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
