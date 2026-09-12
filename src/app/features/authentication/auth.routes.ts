import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ForgetPasswordComponent } from './components/forgot-password/forgot-password.component';

/**
 * FASE 0A: rutas mínimas de autenticación, sin guards.
 * En la FASE 1 se añade `guestGuard` (docs/architecture/mi-pimpollito-plan.md §6.3).
 */
export default [
    { path: 'login', component: LoginComponent },
    { path: 'forgot-password', component: ForgetPasswordComponent },
    { path: '', pathMatch: 'full', redirectTo: 'login' },
] satisfies Routes;
