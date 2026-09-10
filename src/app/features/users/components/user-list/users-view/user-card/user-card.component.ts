import { Component, inject, Input, OnInit } from '@angular/core';
import { IUser } from 'app/features/users/models';
import { User } from 'app/features/users/models/user.model';
import { UserStateService } from 'app/features/users/services';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { UserDetailComponent } from '../../../user-detail/user-detail.component';

@Component({
    selector: 'app-user-card',
    templateUrl: './user-card.component.html',
    styleUrl: './user-card.component.scss',
})
export class UserCardComponent implements OnInit {
    userState = inject(UserStateService);

    private dialogRef!: DynamicDialogRef;
    constructor(private dialogService: DialogService) { }

    ngOnInit(): void {
        this.userState.reload();
        this.userState.findPage({perPage: 8}).then();
    }

    get items() {
        const { items } = this.userState.state();
        return items.data;
    }

    getUser(data: IUser) {
        return new User(data);
    }

    loadMore() {
        this.userState.findNextPage();
    }

    onNextPage(event: any): void {
        this.userState.findNextPage().then();
    }

    onPreviousPage(event: any): void {
        this.userState.findPreviousPage().then();
    }

    openUserDetail(uuid: string) {
        this.dialogRef = this.dialogService.open(UserDetailComponent, {
            header: 'Detalles del Usuario',
            styleClass: 'w-full md:w-2/3 h-full md:h-4/5',
            data: { itemId: uuid }
        });
    }
}
