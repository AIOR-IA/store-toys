import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RolesRoutingModule } from './roles-routing.module';
import {
    PermissionFormComponent,
    PermissionListComponent, PermissionOptionsComponent,
    RoleCardViewComponent,
    RoleDetailComponent,
    RoleEditComponent,
    RoleFormSharedComponent,
    RoleListComponent,
    RoleNewComponent,
    RoleTableViewComponent,
} from './components';
import {
    BodyHeaderComponent,
    FieldErrorComponent,
    ItemsNotFoundComponent,
    SearchBarComponent,
    TitleBarComponent,
} from '@shared/components';
import { TranslateModule } from '@ngx-translate/core';
import { RolePermissionsService, RolesService, RoleStateService } from './services';
import { TableModule } from 'primeng/table';
import { ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { InputSwitchModule } from 'primeng/inputswitch';
import { RoleOptionsComponent } from './components/role-list/view/role-options/role-options.component';
import { MenuModule } from 'primeng/menu';
import { DialogService } from 'primeng/dynamicdialog';
import { DropdownModule } from 'primeng/dropdown';
import { PermissionsDirective } from '@shared/directives';
import { TabViewModule } from 'primeng/tabview';
import { RadioButtonModule } from 'primeng/radiobutton';
import { MessagesModule } from 'primeng/messages';
@NgModule({
    declarations: [
        RoleListComponent,
        RoleDetailComponent,
        RoleEditComponent,
        RoleNewComponent,
        RoleFormSharedComponent,
        RoleCardViewComponent,
        RoleTableViewComponent,
        RoleOptionsComponent,
        PermissionListComponent,
        PermissionFormComponent,
        PermissionOptionsComponent,
    ],
    imports: [
        CommonModule,
        RolesRoutingModule,
        TableModule,
        TranslateModule.forChild(),
        ReactiveFormsModule,
        InputTextareaModule,
        InputTextModule,
        ButtonModule,
        InputSwitchModule,
        MenuModule,
        DropdownModule,
        BodyHeaderComponent,
        SearchBarComponent,
        ItemsNotFoundComponent,
        FieldErrorComponent,
        TitleBarComponent,
        PermissionsDirective,
        TabViewModule,
        RadioButtonModule,
        MessagesModule
    ],
    providers: [RolesService, RoleStateService, DialogService, RolePermissionsService ],
})
export class RolesModule {}
