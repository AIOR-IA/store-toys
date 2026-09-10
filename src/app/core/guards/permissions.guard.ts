import { Injectable } from '@angular/core';
import {
    ActivatedRouteSnapshot,
    RouterStateSnapshot,
    Router,
    CanActivateChild,
    GuardResult,
    MaybeAsync,
} from '@angular/router';
import { SessionService } from '@core/services';
import { camelCase } from 'lodash';

@Injectable({
    providedIn: 'root',
})
export class PermissionsGuard implements CanActivateChild {
    constructor(
        private sessionService: SessionService,
        private router: Router,
    ) {}

    canActivateChild(
        childRoute: ActivatedRouteSnapshot,
        state: RouterStateSnapshot,
    ): MaybeAsync<GuardResult> {
        const isPublic = !!childRoute.data['public'];

        if (isPublic) {
            return true;
        }

        let hasAccess = false;
        const resourceName = childRoute.data['resource'];
        const permission = childRoute.data['permission'];

        if (resourceName && permission) {
            const dynamicFnName = camelCase(permission);

            if (Array.isArray(resourceName)) {
                for (const resource of resourceName) {
                    hasAccess = (this.sessionService as any)[dynamicFnName](
                        resource,
                    );
                    if (hasAccess) break;
                }
            } else {
                hasAccess = (this.sessionService as any)[dynamicFnName](
                    resourceName,
                );
            }

            if (!hasAccess) {
                this.router.navigate(['/unauthorized']).then();
                return false;
            }
        } else {
            hasAccess = true;
        }

        return hasAccess;
    }
}
