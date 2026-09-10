import { NgModule } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';

import { HomeRoutingModule } from './home-routing.module';
import { SelectButtonModule } from 'primeng/selectbutton';
import { HomeComponent } from './components/dashboard/home.component';
import { FormsModule } from '@angular/forms';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TranslateModule } from '@ngx-translate/core';
import { DropdownModule } from 'primeng/dropdown';
import { OrderListModule } from 'primeng/orderlist';
import { ButtonModule } from 'primeng/button';

@NgModule({
    declarations: [HomeComponent],
    imports: [
        CommonModule,
        HomeRoutingModule,
        SelectButtonModule,
        FormsModule,
        ChartModule,
        CardModule,
        TableModule,
        TranslateModule.forChild(),
        DropdownModule,
        OrderListModule,
        DecimalPipe,
        ButtonModule,
    ],
    providers: [ ],
})
export class HomeModule {}
