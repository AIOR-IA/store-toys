import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { UsersRoutingModule } from './users-routing.module';
import { TableModule } from 'primeng/table';

import {
    UserCardComponent,
    UserDetailComponent,
    UserEditFormComponent,
    UserNewFormComponent,
    UserFormComponent,
    UserListComponent,
    UsersViewComponent,
    UserTableComponent,
    PersonalInfoComponent,
    ContactInfoComponent,
    UserMenuOptionsComponent,
} from './components';
import { UsersService, UserStateService } from './services';
import {
    BodyHeaderComponent,
    CardsPaginatorComponent,
    FieldErrorComponent,
    FilterTabComponent,
    FlowStatusFilterTabComponent,
    ItemsNotFoundComponent,
    SearchBarComponent,
    TitleBarComponent,
} from '@shared/components';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { CalendarModule } from 'primeng/calendar';
import { InputNumberModule } from 'primeng/inputnumber';
import { MenuModule } from 'primeng/menu';
import { RolesService } from '../roles/services';
import { MultiSelectModule } from 'primeng/multiselect';
import { PermissionsDirective } from '@shared/directives';
import { InputSwitchModule } from 'primeng/inputswitch';
import { DropdownModule } from 'primeng/dropdown';
import { ChipModule } from 'primeng/chip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { CardModule } from 'primeng/card';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TitleListComponent } from '../../shared/components/ui/title-list/title-list.component';
import { StepsModule } from 'primeng/steps';
import { OrganizationChartModule } from 'primeng/organizationchart';
import { TabViewModule } from 'primeng/tabview';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { TagModule } from 'primeng/tag';

@NgModule({
    declarations: [
        UserListComponent,
        UserDetailComponent,
        UserFormComponent,
        UserEditFormComponent,
        UserCardComponent,
        UsersViewComponent,
        UserTableComponent,
        UserFormComponent,
        UserNewFormComponent,
        PersonalInfoComponent,
        ContactInfoComponent,
        UserMenuOptionsComponent,

    ],
    imports: [
        CommonModule,
        UsersRoutingModule,
        ButtonModule,
        InputTextModule,
        InputNumberModule,
        CalendarModule,
        MenuModule,
        BodyHeaderComponent,
        ReactiveFormsModule,
        MultiSelectModule,
        TranslateModule.forChild(),
        SearchBarComponent,
        ItemsNotFoundComponent,
        TableModule,
        SearchBarComponent,
        FilterTabComponent,
        FieldErrorComponent,
        TitleBarComponent,
        PermissionsDirective,
        InputSwitchModule,
        DropdownModule,
        FlowStatusFilterTabComponent,
        ChipModule,
        ConfirmDialogModule,
        DynamicDialogModule,
        CardModule,
        InputTextareaModule,
        InputSwitchModule,
        CardModule,
        InputSwitchModule,
        InputTextareaModule,
        FormsModule,
        TitleListComponent,
        StepsModule,
        OrganizationChartModule,
        TabViewModule,
        CardsPaginatorComponent,
        OverlayPanelModule,
        TagModule,
    ],
    providers: [
        UsersService,
        UserStateService,
        RolesService,
        DialogService,
    ],
    exports: [],
})
export class UsersModule {}
