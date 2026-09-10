import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ThemeRoutingModule } from './theme-routing.module';
import {
  ThemeCardsComponent,
  ThemeDetailsComponent,
  ThemeEditComponent,
  ThemeFormComponent,
  ThemeListComponent,
  ThemeCreateComponent,
  ThemeOptionsComponent,
  ThemeTableComponent,
} from './components';

import { ThemeService, ThemeStateService } from './services';
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
import { IconsDropdownComponent } from '@shared/components/ui/icons-dropdown/icons-dropdown.component';
import { ColorPickerModule } from 'primeng/colorpicker';

@NgModule({
  declarations: [
    ThemeCardsComponent,
    ThemeDetailsComponent,
    ThemeEditComponent,
    ThemeFormComponent,
    ThemeListComponent,
    ThemeCreateComponent,
    ThemeOptionsComponent,
    ThemeTableComponent,
  ],
  imports: [
    CommonModule,
    ThemeRoutingModule,
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
    IconsDropdownComponent,
    ColorPickerModule,
  ],
  providers: [
    ThemeService,
    ThemeStateService
  ],
})
export class ThemeModule { }
