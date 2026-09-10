import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectRoutingModule } from './projects-routing.module';
import {
    ProjectCardsComponent,
    ProjectDetailsComponent,
    ProjectEditComponent,
    ProjectFormComponent,
    ProjectListComponent,
    ProjectNewComponent,
    ProjectOptionsComponent,
    ProjectTableComponent,
} from './components';
import { ProjectService, ProjectStateService } from './services';
import {
    BodyHeaderComponent,
    FieldErrorComponent,
    ItemsNotFoundComponent,
    SearchBarComponent,
    TitleBarComponent,
    CardsPaginatorComponent,
    TabsActionsComponent,
    MapComponent,
} from '@shared/components'

import { TranslateModule } from '@ngx-translate/core';
import { ButtonDirective } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TruncateTextPipe } from '@shared/pipes';
import { ChipModule } from 'primeng/chip';
import { TableModule } from 'primeng/table';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { UsersModule } from '../users/users.module';
import { CommunityCardsComponent, CommunityDetailsComponent, CommunityEditComponent, CommunityFormComponent, CommunityListComponent, CommunityNewComponent, CommunityOptionsComponent, CommunityTableComponent } from './submodules/communities/components';
import { CommunityService, CommunityStateService } from './submodules/communities/services';
import { InputNumberModule } from 'primeng/inputnumber';
import { CartographicService } from '@core/services';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

@NgModule({
    declarations: [
        ProjectListComponent,
        ProjectCardsComponent,
        ProjectTableComponent,
        ProjectNewComponent,
        ProjectEditComponent,
        ProjectFormComponent,
        ProjectDetailsComponent,
        ProjectOptionsComponent,

        //community components
        CommunityListComponent,
        CommunityCardsComponent,
        CommunityTableComponent,
        CommunityNewComponent,
        CommunityEditComponent,
        CommunityFormComponent,
        CommunityDetailsComponent,
        CommunityOptionsComponent,
    ],
    imports: [
        CommonModule,
        ProjectRoutingModule,
        BodyHeaderComponent,
        SearchBarComponent,
        TranslateModule,
        ReactiveFormsModule,
        ButtonDirective,
        MenuModule,
        InputTextModule,
        ItemsNotFoundComponent,
        TruncateTextPipe,
        ChipModule,
        InputTextareaModule,
        TableModule,
        InputSwitchModule,
        TitleBarComponent,
        FieldErrorComponent,
        CardsPaginatorComponent,
        TabsActionsComponent,
        DropdownModule,
        UsersModule,
        InputNumberModule,
        MapComponent,
        ConfirmDialogModule,
    ],
    providers: [
        ProjectService,
        ProjectStateService,
        CommunityService,
        CommunityStateService,
        CartographicService,
    ],
})
export class ProjectModule { }
