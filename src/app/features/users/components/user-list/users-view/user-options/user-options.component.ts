import {
    Component,
    inject,
    input,
    OnChanges,
    SimpleChanges,
    ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionService, ToastService } from '@core/services';
import { FlowStatus } from '@core/types';
import { TranslateService } from '@ngx-translate/core';
import { IUser } from 'app/features/users/models';
import { User } from 'app/features/users/models/user.model';
import { UsersService, UserStateService } from 'app/features/users/services';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import { catchError, takeUntil } from 'rxjs';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { UserEditFormComponent } from '../../../user-form/user-edit-form/user-edit-form.component';
import { UserDetailComponent } from '../../../user-detail/user-detail.component';
@Component({
    selector: 'app-user-menu-options',
    templateUrl: './user-options.component.html',
    styleUrl: './user-options.component.scss',
})
export class UserMenuOptionsComponent implements OnChanges {
    service = inject(UsersService);
    stateUsers = inject(UserStateService);
    confirmService = inject(ConfirmationService);
    translate = inject(TranslateService);
    router = inject(Router);
    toast = inject(ToastService);
    sessionService = inject(SessionService);
    items: MenuItem[] = [];
    item = input.required<IUser>();
    commonMessages!: Record<string, string>;

    constructor(private dialogService: DialogService) {}

    @ViewChild('menu') menu!: Menu;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['item'] && this.item())
            this.translate.get('app.common').subscribe((tCommon) => {
                this.loadOptions(tCommon);
                this.commonMessages = tCommon.messages;
            });
    }

    loadOptions(t: any) {
        const user = new User(this.item());
        this.items = [
            {
                label: t.options,
                items: [
                    {
                        label: t.details,
                        icon: 'fas fa-eye',
                        command: () => {
                            const itemId = this.item().uuid;
                            this.stateUsers.ref = this.dialogService.open(
                                UserDetailComponent,
                                {
                                    header: 'Detalles del Usuario',
                                    styleClass:
                                        'w-full md:w-2/3 h-full md:h-4/5',
                                    data: { itemId },
                                }
                            );
                        },
                    },
                    {
                        label: t.edit ,
                        icon: 'fas fa-pencil-alt',
                        command: () => {
                            const itemId = this.item().uuid;
                            this.stateUsers.ref = this.dialogService.open(
                                UserEditFormComponent,
                                {
                                    header: 'Editar Usuario',
                                    styleClass:
                                        'w-full md:w-2/3 h-full md:h-4/5',
                                    data: { itemId },
                                }
                            );
                        },
                        visible:
                            this.sessionService.canUpdate(
                                this.stateUsers.resources.USERS
                            ),
                    },
                    {
                        label: t.resent,
                        icon: 'fas fa-envelopes-bulk',
                        command: () => {
                            const idUser = this.item().id;
                            this.resendConfirmationEmail(idUser);
                        },
                        disabled: !this.item().enabled,
                        visible: !user.accountConfirmed,
                    },
                ],
            },
        ];
    }

    toggleMenu(event: Event) {
        if (this.menu) {
            this.menu.toggle(event);
        }
    }

    goTo(path: string) {
        this.router.navigate([path]);
    }

    delete() {
        const itemId = this.item().id;
        this.confirmService.confirm({
            accept: () => {
                this.service
                    .delete(itemId)
                    .pipe(
                        catchError((error) => {
                            this.toast.error('app.common.messages.notDeleted');
                            return error;
                        })
                    )
                    .subscribe(() => {
                        this.stateUsers.reload();
                        this.toast.success('app.common.messages.deleted');
                    });
            },
        });
    }

    updateFlowStatus(status: FlowStatus) {
        const itemId = this.item().id;
        this.confirmService.confirm({
            message: this.commonMessages[status.toLocaleLowerCase()],
            accept: () => {
                this.service
                    .updateFlowStatus(itemId, status)
                    .pipe(
                        catchError((error) => {
                            this.toast.error('app.common.messages.notUpdated');
                            return error;
                        })
                    )
                    .subscribe(() => {
                        this.stateUsers.reload();
                        this.toast.success('app.common.messages.updated');
                    });
            },
        });
    }

    resendConfirmationEmail(idUser: number) {
        this.service
            .resendConfirmEmail(idUser)
            .pipe(
                catchError((error) => {
                    console.error('Error resending confirm email:', error);
                    this.toast.error('app.common.messages.notResent');
                    return error;
                })
            )
            .subscribe(() => {
                this.toast.success('app.common.messages.resent');
            });
    }
}
