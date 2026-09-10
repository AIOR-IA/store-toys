import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AuthenticationRoutingModule } from './authentication-routing.module';
import { AccountConfirmationComponent, LoginComponent } from './components';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ForgetPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { TranslateModule } from '@ngx-translate/core';
import { MessagesModule } from 'primeng/messages';

@NgModule({
    declarations: [
        LoginComponent,
        AccountConfirmationComponent,
        ForgetPasswordComponent,
        ResetPasswordComponent,
    ],
    imports: [
        CommonModule,
        AuthenticationRoutingModule,
        ButtonModule,
        CheckboxModule,
        InputTextModule,
        FormsModule,
        ReactiveFormsModule,
        PasswordModule,
        ToastModule,
        TranslateModule,
        MessagesModule
    ],
    providers: [MessageService],
})
export class AuthenticationModule {}
