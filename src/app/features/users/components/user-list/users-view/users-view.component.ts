import { Component, inject, input, InputSignal } from '@angular/core';
import { GRID_VIEW, LIST_VIEW } from '@shared/constants';
import { OfficeUsersTabs, UserStateService } from 'app/features/users/services';

@Component({
    selector: 'app-users-view',
    templateUrl: './users-view.component.html',
    styleUrl: './users-view.component.scss',
})
export class UsersViewComponent {
    userState = inject(UserStateService);
    view = input<string>(LIST_VIEW);
    isUserRequestView: InputSignal<boolean> = input<boolean>(false);

    get isGridView() {
        return this.view() === GRID_VIEW;
    }

    get isListView() {
        return this.view() === LIST_VIEW;
    }

    onChangeTab(event: any) {
        // const mainTab = this.userState.currentTab();
        let filter = {};
        filter = {}
        this.userState.findPage({
            page: 1,
            filter,
        });
    }
}
