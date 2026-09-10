import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Observable, tap } from 'rxjs';
import { IUser } from 'app/features/users/models';
import { CURRENT_ROLE_ID_KEY } from '@core/types';
import { UserContextType } from '@shared/constants';
import { ActivateAccountPayload, ActivateAccountResponse } from '../../features/authentication/models/activate-account.interface';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    apiUrl = environment.API_URL;
    private intervalId: any;
    private tokenKey = 'authToken';
    constructor(
        private readonly httpClient: HttpClient,
        private readonly router: Router,
    ) { }

    login(username: string, password: string, context?: UserContextType) {
        return this.httpClient
            .post(`${this.apiUrl}/auth/login`, { username, password, context })
            .pipe(
                tap((res: any) => {
                    this.storeToken(res.access_token);
                }),
            );
    }

    findUser(token: string, type: string = ''): Observable<IUser> {
        return this.httpClient.get<IUser>(
            `${this.apiUrl}/auth/${token}/find-user`, { params: { type } }
        );
    }

    changePassword(id: number, data: IUser, context?: UserContextType,): Observable<IUser> {
        return this.httpClient.patch<IUser>(
            `${this.apiUrl}/auth/${id}/change-password`,
            data,
            { params: { type: context || '' } },
        );
    }

    confirmAccount(id: number, data: IUser, context?: UserContextType): Observable<IUser> {
        return this.httpClient.patch<IUser>(
            `${this.apiUrl}/auth/${id}/confirm-account`,
            data,
            { params: { type: context || '' } },
        );
    }

    isAuthenticated(): boolean {
        const token = this.getToken();

        if (!token) {
            return false;
        }

        let payload: any;
        try {
            const base64 = token
                .split('.')[1]
                .replace(/-/g, '+')
                .replace(/_/g, '/'); //JWT token
            payload = JSON.parse(atob(base64));
        } catch (error) {
            return false;
        }

        if (!payload) {
            return false;
        }

        const exp = payload.exp * 1000; //convert to milliseconds

        if (!isNaN(exp)) {
            return Date.now() < exp;
        }

        return true;
    }

    logout(expired = false) {
        sessionStorage.removeItem(this.tokenKey);
        sessionStorage.removeItem(CURRENT_ROLE_ID_KEY);

        if (expired) {
            location.href = '/auth/login?expired=true';

        } else {
            location.href = '/auth/login';
        }
    }

    private storeToken(token: string) {
        sessionStorage.setItem(this.tokenKey, token);
    }

    getToken() {
        return sessionStorage.getItem(this.tokenKey);
    }

    public forgotPassword(email: string, ctx: string): Observable<{
        message: string;
        passwordResetAttempts: number;
        maxPasswordResetAttempts: number;
    }> {
        return this.httpClient.post<{
            message: string;
            passwordResetAttempts: number;
            maxPasswordResetAttempts: number;
        }>(`${this.apiUrl}/auth/forgot-password`, {
            email, context: ctx
        });
    }

    public findUserByResetPasswordToken(token: string): Observable<IUser> {
        return this.httpClient.get<IUser>(
            `${this.apiUrl}/auth/reset-password/${token}/find-user`,
        );
    }

    public resetPassword(id: number, data: IUser): Observable<IUser> {
        return this.httpClient.patch<IUser>(
            `${this.apiUrl}/auth/${id}/reset-password/`,
            data,
        );
    }

    startTokenCheck(): void {
        // Verificar cada 30 segundos (puedes ajustar el tiempo)
        this.intervalId = setInterval(() => {
            if (!this.isAuthenticated()) {
                this.logout(true);
            }
        }, 30000);
    }

    stopTokenCheck(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    public validateActivation(payload: ActivateAccountPayload): Observable<ActivateAccountResponse> {
        return this.httpClient.post<ActivateAccountResponse>(
            `${this.apiUrl}/auth/activate/validate`,
            payload
        );
    }
}
