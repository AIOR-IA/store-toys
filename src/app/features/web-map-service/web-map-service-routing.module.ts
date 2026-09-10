import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {
  WebMapServiceDetailsComponent,
  WebMapServiceEditComponent,
  WebMapServiceListComponent,
  WebMapServiceCreateComponent,
} from './components';

const routes: Routes = [
    { path: '', component: WebMapServiceListComponent },
    {
        path: 'create',
        component: WebMapServiceCreateComponent,
    },
    { path: ':uuid', component: WebMapServiceDetailsComponent },
    {
        path: ':uuid/edit',
        component: WebMapServiceEditComponent,
    },
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class WebMapServiceRoutingModule { }
