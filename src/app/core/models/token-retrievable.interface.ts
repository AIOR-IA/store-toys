import { Observable } from 'rxjs';

export interface ITokenRetrievable<T> {
    getByToken(token: string): Promise<T | null> | Observable<T | null>;
}
