import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { WebMapServiceRoutingModule } from './web-map-service-routing.module';
import {
  WebMapServiceCardsComponent,
  WebMapServiceDetailsComponent,
  WebMapServiceEditComponent,
  WebMapServiceFormComponent,
  WebMapServiceListComponent,
  WebMapServiceCreateComponent,
  WebMapServiceOptionsComponent,
  WebMapServiceTableComponent,
} from './components';

import { WebMapServiceService, WebMapServiceStateService } from './services';
import {
  BodyHeaderComponent,
  FieldErrorComponent,
  ItemsNotFoundComponent,
  SearchBarComponent,
  TabsActionsComponent,
  TitleBarComponent,
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
import { PaginatorModule } from 'primeng/paginator';

@NgModule({
  declarations: [
    WebMapServiceCardsComponent,
    WebMapServiceDetailsComponent,
    WebMapServiceEditComponent,
    WebMapServiceFormComponent,
    WebMapServiceListComponent,
    WebMapServiceCreateComponent,
    WebMapServiceOptionsComponent,
    WebMapServiceTableComponent,
  ],
  imports: [
    CommonModule,
    WebMapServiceRoutingModule,
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
    TabsActionsComponent,
    DropdownModule,
    PaginatorModule,
  ],
  providers: [
    WebMapServiceService,
    WebMapServiceStateService
  ],
})
export class WebMapServiceModule { }
