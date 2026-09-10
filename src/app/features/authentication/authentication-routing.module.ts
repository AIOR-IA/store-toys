import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AccountConfirmationComponent, LoginComponent } from './components';
import { AuthenticatedGuard } from '../../core/guards';
import { ForgetPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';

const routes: Routes = [
    {
        path: 'login',
        component: LoginComponent,
        canActivate: [AuthenticatedGuard],
    },
    {
        path: 'confirm-account/:uuid/:token',
        component: AccountConfirmationComponent,
    },
    {
        path: 'forgot-password',
        component: ForgetPasswordComponent,
    },
    {
        path: 'reset-password/:uuid/:token',
        component: ResetPasswordComponent,
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class AuthenticationRoutingModule {}
