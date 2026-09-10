import { Component, inject, input, OnInit } from '@angular/core';
import { Pagination } from '@core/types';
import { IUser } from 'app/features/users/models';
import { User } from 'app/features/users/models/user.model';
import { UserStateService } from 'app/features/users/services';

@Component({
    selector: 'app-user-table',
    templateUrl: './user-table.component.html',
    styleUrl: './user-table.component.scss',
})
export class UserTableComponent implements OnInit {
    userState = inject(UserStateService);

    ngOnInit(): void {
        // this.userState.findPage({});
    }

    async loadLazy(event: any) {
        const pagination: Pagination = this.userState.parsePagination(event);
        this.userState.findPage(pagination);
    }

    getUser(data: IUser) {
        return new User(data);
    }

    getUniqueResourceNames(roleUsers: any[]): string[] {
    const namesSet = new Set<string>();

        for (const roleUser of roleUsers) {
            for (const permission of roleUser.role.permissions) {
                namesSet.add(permission.resource.name);
            }
        }

        return Array.from(namesSet).sort((a, b) => a.localeCompare(b));
    }
}
