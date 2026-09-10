import { Injectable } from '@angular/core';
import { IHttService } from '@core/models/http-service.interface';
import { BaseHttpService } from '@core/services';
import { IUser } from 'app/features/users/models';

@Injectable()
export class ProfileService
    extends BaseHttpService<IUser>
    implements IHttService<IUser>
{
    constructor() {
        super('users');
    }
}
