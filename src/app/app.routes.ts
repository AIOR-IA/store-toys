import { Routes } from '@angular/router';
import { NotFoundComponent, UnauthorizedComponent } from '@shared/components';
import { AppLayoutComponent } from './layout/layout.component';
import { AuthGuard, PermissionsGuard } from '@core/guards';
import { RESOURCES } from '@shared/constants';
import { SystemAccessPermissions } from '@core/types';

export const routes: Routes = [

    {
        path: 'auth',
        loadChildren: () =>
            import('./features/authentication/authentication.module').then(
                (m) => m.AuthenticationModule
            ),
    },
    {
        path: '',
        component: AppLayoutComponent,
        canActivate: [AuthGuard],
        canActivateChild: [PermissionsGuard],
        children: [
            {
                path: '',
                loadChildren: () =>
                    import('./features/home/home.module').then(
                        (m) => m.HomeModule
                    ),
            },
            {
                path: 'admin/users',
                data: {
                    resource: RESOURCES.USERS,
                    permission: SystemAccessPermissions.CAN_READ,
                },
                loadChildren: () =>
                    import('./features/users/users.module').then(
                        (m) => m.UsersModule
                    ),
            },
            {
                path: 'admin/projects',
                data: {
                    resource: RESOURCES.USERS,
                    permission: SystemAccessPermissions.CAN_READ,
                },
                loadChildren: () =>
                    import('./features/projects/projects.module').then(
                        (m) => m.ProjectModule
                    ),
            },
            {
                path: 'admin/roles',
                data: {
                    resource: RESOURCES.ROLES,
                    permission: SystemAccessPermissions.CAN_READ,
                },
                loadChildren: () =>
                    import('./features/roles/roles.module').then(
                        (m) => m.RolesModule
                    ),
            },
            {
                path: 'admin/audit',
                data: {
                    resource: RESOURCES.AUDIT,
                    permission: SystemAccessPermissions.CAN_READ,
                },
                loadChildren: () =>
                    import('./features/audit/audit.module').then(
                        (m) => m.AuditModule
                    ),
            },
            {
                path: 'profile',
                loadChildren: () =>
                    import('./features/profile/profile.module').then(
                        (m) => m.ProfileModule
                    ),
            },
            {
                path: 'admin/theme',
                data: {
                    resource: RESOURCES.GEOGRAPHIC_LAYER,
                    permission: SystemAccessPermissions.CAN_READ,
                },
                loadChildren: () =>
                    import('./features/theme/theme.module').then(
                        (m) => m.ThemeModule
                    ),
            },
        ],
    },
    { path: 'unauthorized', component: UnauthorizedComponent },
    { path: '**', component: NotFoundComponent },
];
