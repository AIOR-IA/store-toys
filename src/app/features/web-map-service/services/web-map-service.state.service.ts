import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { IWebMapService } from '../models';
import { WebMapServiceService } from './web-map-service.service';

@Injectable({ providedIn: 'root' })
export class WebMapServiceStateService extends BaseStateService<IWebMapService> {

    constructor() {
        super(WebMapServiceService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
