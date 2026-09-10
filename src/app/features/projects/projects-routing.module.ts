import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {
    ProjectDetailsComponent,
    ProjectEditComponent,
    ProjectListComponent,
    ProjectNewComponent,
} from './components';
import {
    CommunityDetailsComponent,
    CommunityEditComponent,
    CommunityListComponent,
    CommunityNewComponent
} from './submodules/communities/components';

const routes: Routes = [
    { path: '', component: ProjectListComponent },
    {
        path: 'new',
        component: ProjectNewComponent,
    },
    { path: ':uuid', component: ProjectDetailsComponent },
    {
        path: ':uuid/edit',
        component: ProjectEditComponent,
    },

    // Proyect communities Routes
    {
        path: 'communities/:uuid/list',
        component: CommunityListComponent,
    },
    {
        path: 'communities/:uuid/:id/new',
        component: CommunityNewComponent,
    },
    {
        path: 'communities/:uuid/:id/details',
        component: CommunityDetailsComponent,
    },
    {
        path: 'communities/:uuid/:id/edit',
        component: CommunityEditComponent,
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class ProjectRoutingModule { }
