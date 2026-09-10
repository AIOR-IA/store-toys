import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { CardModule } from 'primeng/card';
import { PasswordModule } from 'primeng/password';

import { ProfileRoutingModule } from './profile-routing.module';
import { ProfileComponent } from './components/profile/profile.component';
import { BodyHeaderComponent } from '@shared/components';
import { CalendarModule } from 'primeng/calendar';
import { ChangePasswordComponent } from './components/change-password/change-password.component';
import { ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ProfileService } from './services/profile.service';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PermissionsDirective } from '@shared/directives';

@NgModule({
    declarations: [ProfileComponent, ChangePasswordComponent],
    imports: [
        CommonModule,
        ProfileRoutingModule,
        BodyHeaderComponent,
        TranslateModule.forChild(),
        CardModule,
        CalendarModule,
        PasswordModule,
        ReactiveFormsModule,
        InputTextModule,
        ToastModule,
        PermissionsDirective
    ],
    providers: [ProfileService, MessageService],
})
export class ProfileModule {}
