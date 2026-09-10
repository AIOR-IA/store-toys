import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { IUser } from '../models';
import { IHttService } from '@core/models/http-service.interface';
import { Observable } from 'rxjs';
import { FlowStatus } from '@core/types';

@Injectable()
export class UsersService
    extends BaseHttpService<IUser>
    implements IHttService<IUser>
{
    constructor() {
        super('users');
    }

    updateFlowStatus(id: number, status: FlowStatus): Observable<IUser> {
        return this.http.patch<IUser>(
            `${this.apiUrl}/${this.pathContext}/${id}/flow-status`,
            { flowStatus: status },
        );
    }

    resendConfirmEmail(id: number): Observable<boolean> {
        return this.http.post<boolean>(
            `${this.apiUrl}/${this.pathContext}/${id}/resend-confirm-email`,
            {},
        );
    }

    checkUserExist(usernameOrEmail: string): Observable<boolean> {
        return this.http.head<boolean>(
            `${this.apiUrl}/${this.pathContext}/check-existence/${usernameOrEmail}`,
        );
    }

    usersSync(): Observable<boolean> {
      return this.http.post<boolean>(
          `${this.apiUrl}/${this.pathContext}/users-sync`,
          {},
      );
    }
}
