import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {
    PermissionListComponent,
    RoleDetailComponent,
    RoleEditComponent,
    RoleListComponent,
    RoleNewComponent,
} from './components';

const routes: Routes = [
    { path: '', component: RoleListComponent },
    {
        path: 'new',
        component: RoleNewComponent,
    },
    { path: ':uuid', component: RoleDetailComponent },
    {
        path: ':uuid/edit',
        component: RoleEditComponent,
    },
    {
        path: ':uuid/permissions',
        component: PermissionListComponent,
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class RolesRoutingModule {}
