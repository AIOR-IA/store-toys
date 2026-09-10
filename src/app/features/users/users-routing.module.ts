import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {
    UserDetailComponent,
    UserEditFormComponent,
    UserListComponent,
    UserNewFormComponent,
} from './components';

const routes: Routes = [
    { path: '', component: UserListComponent },
    {
        path: 'new',
        component: UserNewFormComponent,
    },
    { path: ':uuid', component: UserDetailComponent },
    {
        path: ':uuid/edit',
        component: UserEditFormComponent,
    },

];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class UsersRoutingModule {}
