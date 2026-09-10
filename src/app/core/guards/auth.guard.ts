import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, SessionService } from '../services';

export const AuthGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const sessionService = inject(SessionService);

    const router = inject(Router);

    if (authService.isAuthenticated()) {
        return true;
    } else {
        return router.navigate(['/auth/login']);
    }
};
