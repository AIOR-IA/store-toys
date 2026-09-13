import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ForgetPasswordComponent } from './components/forgot-password/forgot-password.component';
import { guestGuard } from '@core/session';

/**
 * FASE 1: rutas de invitado, protegidas por `guestGuard` — si ya hay una
 * sesión `active`, no tiene sentido ver el login de nuevo
 * (docs/architecture/mi-pimpollito-plan.md §6.3).
 */
export default [
    { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
    {
        path: 'forgot-password',
        component: ForgetPasswordComponent,
        canActivate: [guestGuard],
    },
    { path: '', pathMatch: 'full', redirectTo: 'login' },
] satisfies Routes;
