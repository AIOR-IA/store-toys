import { ITokenRetrievable } from '@core/models';
import { BaseHttpService } from '@core/services';
import { Observable } from 'rxjs';

export abstract class BaseUserRequestService<T>
    extends BaseHttpService<T>
    implements ITokenRetrievable<T>
{
    abstract getByToken(token: string): Observable<T | null>;
}
