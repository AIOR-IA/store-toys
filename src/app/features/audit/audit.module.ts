import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AuditRoutingModule } from './audit-routing.module';
import { AuditComponent } from './components';
import { TranslateModule } from '@ngx-translate/core';
import { TableModule } from 'primeng/table';
import { BodyHeaderComponent } from '@shared/components';
import { AuditService, AuditStateService } from './services';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { MultiSelectModule } from 'primeng/multiselect';
import { FormsModule } from '@angular/forms';
import { SearchBarComponent } from '../../shared/components/ui/search-bar/search-bar.component';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
@NgModule({
    declarations: [AuditComponent],
    imports: [
        CommonModule,
        AuditRoutingModule,
        TranslateModule.forChild(),
        TableModule,
        OverlayPanelModule,
        BodyHeaderComponent,
        MultiSelectModule,
        FormsModule,
        SearchBarComponent,
        ButtonModule,
        FormsModule,
        CalendarModule,
    ],
    providers: [AuditService, AuditStateService],
})
export class AuditModule {}
