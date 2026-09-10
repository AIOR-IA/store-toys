import { inject, Injectable, WritableSignal, signal } from '@angular/core';
import { BaseStateService } from '@core/services';
import { IUser } from '../models';
import { UsersService } from './users.service';
import { Subject } from 'rxjs';
import { FlowStatus, Pagination } from '@core/types';
import { catchError, map, switchMap } from 'rxjs/operators';
import { RolesService } from '../../roles/services';
import { DynamicDialogRef } from 'primeng/dynamicdialog';

export const OfficeUsersTabs = {
    withOffice: 0,
    whitoutOffice: 1,
};
@Injectable({ providedIn: 'root' })
export class UserStateService extends BaseStateService<IUser> {
    rolesService = inject(RolesService);
    changeRoles$: Subject<Pagination>;
    loadRoles$: any;
    ref!: DynamicDialogRef;
    activeOfficeUsersTabIndex: number = OfficeUsersTabs.withOffice;
    constructor() {
        super(UsersService, {
            sort: 'firstName',
            order: 'asc',
            // filter: { flowStatus: FlowStatus.APPROVED },
        });

        this.state.set({
            ...this.initialState,
            rolePagination: { data: [] },
        });
        this.changeRoles$ = new Subject<Pagination>();
        this.initializeLoadRolesBehaviour();
    }

    initializeLoadRolesBehaviour() {
        this.loadRoles$ = this.changeRoles$.pipe(
            switchMap((pagination: Pagination) => {
                this.set('status', 'loading');
                pagination.perPage = 200;
                pagination.page = 1;
                return this.rolesService.findAll(pagination);
            }),
            map((response) => ({
                ...this.state(),
                rolePagination: response,
                status: 'success' as const,
            })),
            catchError(() => [
                {
                    ...this.state(),
                    rolePagination: { data: [] },
                    status: 'error' as const,
                },
            ]),
        );
        this.loadRoles$.subscribe((response: any) => {
            const currentRoles = response.rolePagination?.data || [];
            const assignedRoles =
                this.current?.roleUsers
                    ?.map((ru) => ru.role)
                    .filter((role) => role.code === 'OFFICE_ADMIN') ?? [];

            const merged = [...assignedRoles, ...currentRoles];

            const uniqueRoles = merged.filter(
                (role, index, self) => index === self.findIndex((r) => r.id === role.id)
            );

            this.setState({
                ...response,
                rolePagination: {
                    ...response.rolePagination,
                    data: uniqueRoles
                }
            });
        });
    }

    get roles() {
        return this.state()['rolePagination']?.data || [];
    }

    async findRoles(pagination: Partial<Pagination>) {
        const _pagination = { ...this.pagination, ...pagination };
        this.changeRoles$.next(_pagination);
    }
}
