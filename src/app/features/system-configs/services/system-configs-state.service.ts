import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { ISystemConfig } from '../models';
import { SystemConfigService } from './system-configs.service';

@Injectable({ providedIn: 'root' })
export class SystemConfigStateService extends BaseStateService<ISystemConfig> {

    constructor() {
        super(SystemConfigService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
