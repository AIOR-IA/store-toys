import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router } from '@angular/router';
import { AuthenticatedGuard } from './authenticated.guard';
import { AuthService } from '@core/services';


describe('authenticatedGuard', () => {
    const executeGuard: CanActivateFn = (...guardParameters) =>
        TestBed.runInInjectionContext(() => AuthenticatedGuard(...guardParameters));

    let authService: jasmine.SpyObj<AuthService>;
    let router: jasmine.SpyObj<Router>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['isAuthenticated']) },
                { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
            ],
        });

        authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
        router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    });

    it('should be created', () => {
        expect(executeGuard).toBeTruthy();
    });

    it('should redirect to root (/) when user IS authenticated', () => {
        authService.isAuthenticated.and.returnValue(true);
        router.navigate.and.returnValue(Promise.resolve(true) as any);

        const result = executeGuard({} as any, {} as any);

        expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should allow access (return true) when user is NOT authenticated', () => {
        authService.isAuthenticated.and.returnValue(false);

        const result = executeGuard({} as any, {} as any);

        expect(result).toBeTrue();
        expect(router.navigate).not.toHaveBeenCalled();
    });
});
