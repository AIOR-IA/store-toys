import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {
    SystemConfigHookComponent,
} from './components';

const routes: Routes = [
    { path: '', component: SystemConfigHookComponent },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class SystemConfigRoutingModule { }
