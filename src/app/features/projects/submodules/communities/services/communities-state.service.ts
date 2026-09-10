import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { ICommunity } from '../models';
import { CommunityService } from './communities.service';

@Injectable({ providedIn: 'root' })
export class CommunityStateService extends BaseStateService<ICommunity> {

    constructor() {
        super(CommunityService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
