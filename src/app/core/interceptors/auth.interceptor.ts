import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, SessionService } from '@core/services';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const authService = inject(AuthService);
    const sessionService = inject(SessionService);
    const router = inject(Router);

    const authToken = authService.getToken();

    if (!authToken) return next(req);

    let currentRoleUuid = sessionService.role()?.uuid || '';

    const isMobileRoute = router.url.startsWith('/mobile');

    if (isMobileRoute) {
        const collectorRole = sessionService
            .availableRoles()
            .find(role => role.code === 'COLLECTOR');

        if (collectorRole?.uuid) {
            currentRoleUuid = collectorRole.uuid;
        }
    }

    return next(
        req.clone({
            headers: req.headers
                .set('Authorization', `Bearer ${authToken}`)
                .set('current-role', currentRoleUuid),
        })
    );
};
