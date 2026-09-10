import { Component, effect, inject, signal, Signal } from '@angular/core';
import { BaseListComponent } from '@shared/components';
import { IRole } from '../../models';
import { IBaseStateService } from '@core/models';
import { RoleStateService } from '../../services';
import { Message } from 'primeng/api';
import { HttpStatusCode } from '@angular/common/http';
import { ApiResponseMessages } from '@core/types';

@Component({
    selector: 'app-role-list',
    templateUrl: './role-list.component.html',
    styleUrl: './role-list.component.scss',
})
export class RoleListComponent extends BaseListComponent<IRole> {
    override state: IBaseStateService<IRole> = inject(RoleStateService);
    messages: Message[] = [];
    errorsMessages: any;

    constructor() {
        super();
        this.translate.get('app.roles.messages').subscribe((t) => {
            this.errorsMessages = t;
        });
        effect(() => {
            if(this.state.error() && this.hasErrorCannotbeDeleted) {
                this.loadMessages(this.errorsMessages);
            }
        })
    }

    override loadBreadcrumb(): void {
        this.translate.get('app.menu.admin').subscribe((tAdmin) => {
            this.breadcrumbItems.set([
                {
                    label: tAdmin.title,
                    routerLink: '/admin',
                },
                {
                    label: tAdmin.roles,
                    routerLink: '/admin/roles',
                },
            ]);
        });
    }

    loadMessages(t: any) {
        this.messages = [{ severity: 'warn', summary: t.cannotBeDeleted }];
    }

    get hasErrorCannotbeDeleted() {
        const error = this.state.error();
        return (
            error.statusCode === HttpStatusCode.NotAcceptable &&
            error.message === ApiResponseMessages.CANNOT_BE_DELETED
        );
    }

    override loadTabs(): void {}
}
