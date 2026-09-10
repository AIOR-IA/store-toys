import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { IRole } from '../models';
import { IHttService } from '@core/models/http-service.interface';

@Injectable()
export class RolesService
    extends BaseHttpService<IRole>
    implements IHttService<IRole>
{
    constructor() {
        super('roles');
    }
}
