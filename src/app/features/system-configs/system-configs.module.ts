import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SystemConfigRoutingModule } from './system-configs-routing.module';
import {
    SystemConfigHookComponent,
} from './components';
import { SystemConfigService, SystemConfigStateService } from './services';
import {
    BodyHeaderComponent,
    FieldErrorComponent,
    ItemsNotFoundComponent,
    SearchBarComponent,
    TitleBarComponent,
} from '@shared/components'

import { TranslateModule } from '@ngx-translate/core';
import { ButtonDirective } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { ChipModule } from 'primeng/chip';
import { FormsModule } from '@angular/forms';
import { PasswordModule } from 'primeng/password';
import { MarkdownModule } from 'ngx-markdown';
@NgModule({
    declarations: [
      SystemConfigHookComponent,
    ],
    imports: [
        CommonModule,
        SystemConfigRoutingModule,
        BodyHeaderComponent,
        SearchBarComponent,
        TranslateModule,
        ButtonDirective,
        MenuModule,
        ItemsNotFoundComponent,
        ChipModule,
        TitleBarComponent,
        FieldErrorComponent,
        PasswordModule,
        FormsModule,
        MarkdownModule.forRoot(),
    ],
    providers: [SystemConfigService, SystemConfigStateService],
})
export class SystemConfigModule { }
