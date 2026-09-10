import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { IWebMapService } from '../models';
import { IHttService } from '@core/models/http-service.interface';

@Injectable()
export class WebMapServiceService
    extends BaseHttpService<IWebMapService>
    implements IHttService<IWebMapService>
{
    constructor() {
        super('web-map-service');
    }
}
