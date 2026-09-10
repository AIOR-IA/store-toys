import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { environment } from 'environments/environment';

describe('AuthService', () => {
    let service: AuthService;
    let httpMock: HttpTestingController;
    let routerMock: jasmine.SpyObj<Router>;

    beforeEach(() => {
        routerMock = jasmine.createSpyObj('Router', ['navigate']);

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                AuthService,
                { provide: Router, useValue: routerMock },
            ],
        });
        service = TestBed.inject(AuthService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should call login endpoint and store token', () => {
        const username = 'testuser';
        const password = '123456';

        const tokenResponse = { access_token: 'fake.jwt.token' };

        const storeTokenSpy = spyOn<any>(service as any, 'storeToken').and.callThrough();

        service.login(username, password).subscribe(res => {
            expect(res).toEqual(tokenResponse);
        });

        const req = httpMock.expectOne(`${environment.API_URL}/auth/login`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ username, password, context: undefined });

        req.flush(tokenResponse);

        expect(storeTokenSpy).toHaveBeenCalledWith('fake.jwt.token');
    });

    it('should store and get token from sessionStorage', () => {
        const setItemSpy = spyOn(sessionStorage, 'setItem');
        const getItemSpy = spyOn(sessionStorage, 'getItem').and.returnValue('stored-token');

        (service as any).storeToken('my-token');

        expect(setItemSpy).toHaveBeenCalledWith('authToken', 'my-token');

        const token = service.getToken();
        expect(getItemSpy).toHaveBeenCalledWith('authToken');
        expect(token).toBe('stored-token');
    });

    it('should return false in isAuthenticated when there is no token', () => {
        spyOn(service, 'getToken').and.returnValue(null);

        const result = service.isAuthenticated();

        expect(result).toBeFalse();
    });

    it('should return false in isAuthenticated when token is invalid', () => {
        spyOn(service, 'getToken').and.returnValue('invalid.token');

        const result = service.isAuthenticated();

        expect(result).toBeFalse();
    });

    it('should return true in isAuthenticated when token is valid and not expired', () => {
        const payload = {
            exp: Math.floor(Date.now() / 1000) + 60,
        };
        const base64Payload = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const fakeToken = `header.${base64Payload}.signature`;

        spyOn(service, 'getToken').and.returnValue(fakeToken);

        const result = service.isAuthenticated();

        expect(result).toBeTrue();
    });

    it('should return false in isAuthenticated when token is expired', () => {
        const payload = {
            exp: Math.floor(Date.now() / 1000) - 60,
        };
        const base64Payload = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const fakeToken = `header.${base64Payload}.signature`;

        spyOn(service, 'getToken').and.returnValue(fakeToken);

        const result = service.isAuthenticated();

        expect(result).toBeFalse();
    });

    it('should call forgotPassword endpoint with email', () => {
        const email = 'test@mail.com';

        let responseBody: any;
        service.forgotPassword(email).subscribe(res => {
            responseBody = res;
        });

        const req = httpMock.expectOne(`${environment.API_URL}/auth/forgot-password`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ email });

        const mockRes = {
            message: 'ok',
            passwordResetAttempts: 1,
            maxPasswordResetAttempts: 3,
        };

        req.flush(mockRes);

        expect(responseBody).toEqual(mockRes);
    });
});
