import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { AuthService, SessionService } from '@core/services';


describe('authGuard', () => {
    const executeGuard: CanActivateFn = (...guardParameters) =>
        TestBed.runInInjectionContext(() => AuthGuard(...guardParameters));

    let authService: jasmine.SpyObj<AuthService>;
    let router: jasmine.SpyObj<Router>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['isAuthenticated']) },
                { provide: SessionService, useValue: {} },
                { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
            ],
        });

        authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
        router = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    });

    it('should be created', () => {
        expect(executeGuard).toBeTruthy();
    });

    it('should allow access when authenticated', () => {
        authService.isAuthenticated.and.returnValue(true);

        const result = executeGuard({} as any, {} as any);

        expect(result).toBeTrue();
    });

    it('should redirect to login when NOT authenticated', () => {
        authService.isAuthenticated.and.returnValue(false);

        executeGuard({} as any, {} as any);

        expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
});
