import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {
  ThemeDetailsComponent,
  ThemeEditComponent,
  ThemeListComponent,
  ThemeCreateComponent,
} from './components';

const routes: Routes = [
    { path: '', component: ThemeListComponent },
    {
        path: 'create',
        component: ThemeCreateComponent,
    },
    { path: ':uuid', component: ThemeDetailsComponent },
    {
        path: ':uuid/edit',
        component: ThemeEditComponent,
    },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ThemeRoutingModule { }
