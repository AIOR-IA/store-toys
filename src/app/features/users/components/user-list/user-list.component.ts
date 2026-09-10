import {
    Component,
    inject,
    OnInit,
    signal,
    WritableSignal,
} from '@angular/core';
import { MenuItem } from 'primeng/api';
import { LIST_VIEW } from '@shared/constants';
import { OfficeUsersTabs, UserStateService } from '../../services';
import { TranslateService } from '@ngx-translate/core';
import { FlowStatus } from '@core/types';
import { UsersService } from '../../services/users.service';
import { WebsocketService } from '@core/services/websocket.service';
import { UserSynchronizationChannel } from '@core/types/websocket';
import { ToastService } from '../../../../core/services/toast.service';
import { ActivatedRoute } from '@angular/router';
import { catchError, firstValueFrom } from 'rxjs';
import { UrlParamsReader } from '../../../../core/base/url-params-reader.base';

@Component({
    selector: 'app-user-list',
    templateUrl: './user-list.component.html',
    styleUrl: './user-list.component.scss',
})
export class UserListComponent extends UrlParamsReader implements OnInit {
    userState = inject(UserStateService);
    translate = inject(TranslateService);

    breadcrumbItems: MenuItem[] = [];
    currentView: WritableSignal<string> = signal(LIST_VIEW);
    currentUserList: WritableSignal<string> = signal('');
    tabOptions = signal<FlowStatus[]>([]);
    showUserRequestTable: WritableSignal<boolean> = signal(false);
    loading: WritableSignal<boolean> = signal(false);
    private userService: UsersService = inject(UsersService);
    private toast = inject(ToastService);

    constructor() {
        super();
    }

    ngOnInit() {
        this.loadBreadcrumb();
        this.loadEntity();
    }

    loadBreadcrumb() {
        this.breadcrumbItems = [
            {
                label: this.translate.instant('app.menu.admin.title'),
                routerLink: '/admin',
            },
            {
                label: this.translate.instant('app.menu.admin.users'),
                routerLink: '/admin/users',
            },
        ];
    }

    onViewChange(view: string) {
        this.currentView.set(view);
    }

    onSearch(searchValue: string) {
        this.userState.findPage({ query: searchValue });
    }

    onTabChange(option: FlowStatus) {
        // this.userState.currentTab.set(option);
        this.loadUsers();
    }

    loadUsers() {

        // const option = this.userState.currentTab();
        let filter = {};
        filter = {   };

        this.userState.findPage({
            page: 1,
            filter,
        });
    }

    usersSync() {
        this.loading.set(true);
        this.userService.usersSync().subscribe((res) => {
            console.log(res);
        });
    }


    async loadEntity() {

        this.loadUsers();
    }

}
