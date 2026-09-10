import { Component, effect, inject, input, signal, WritableSignal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormModeType } from '@core/types';
import { UserStateService } from 'app/features/users/services';
import { RolesService } from '../../../../../roles/services/role.service';
import { IRole } from '../../../../../roles/models/role.interface';
import { RoleModel } from '../../../../../roles/models/role.model';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

@Component({
    selector: 'app-user-form-contact-info',
    templateUrl: './contact-info.component.html',
    styleUrl: './contact-info.component.scss',
})
export class ContactInfoComponent {
    form = input.required<FormGroup>();
    mode = input.required<FormModeType>();
    stateUsers = inject(UserStateService);
    roleService = inject(RolesService);

    roles = signal<IRole[]>([]);
    currentRole: WritableSignal<RoleModel[]> = signal([]);
    rolesSubject = new Subject<{ query: string }>();
    selectedRoles: number[] = [];

    private roleCache = new Map<number, RoleModel>();
    constructor() {
        this.initData();
        this.rolesSubject.next({ query: '' });

        const roles = effect(() => {
            const roleUsers: any = this.stateUsers.current?.roleUsers;
            if(roleUsers?.length > 0) {
                this.currentRole.set([])
                const ids = roleUsers.map( (role: any) => role.roleId);
                this.selectedRoles = ids;
                // this.loadInfoCurentRoles(ids);

            }
        }, {allowSignalWrites: true})

    }

    get f() {
        return this.form().controls;
    }

    initData() {
        const userId = this.stateUsers.current?.id;

        this.rolesSubject
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe(({ query }) => {
                this.stateUsers
                    .findRoles({
                        filter: JSON.stringify({ userId }),
                        sort: 'name',
                        order: 'asc',
                        query,
                        perPage: 120,
                        page: 1,
                    })
                    .then();
            });
    }

    filterRoles(event: any) {
        const query = event.filter;
        this.rolesSubject.next({ query });
    }

    async onRolesChange(event: any) {
        const ids: number[] = event.value;

        // await this.loadInfoCurentRoles(ids);
    }

    // async loadInfoCurentRoles(ids: number[]) {
    //     if (ids.length === 0) {
    //         this.currentRole.set([]);
    //         return;
    //     }

    //     const cachedRoles: RoleModel[] = [];
    //     const roleIds: number[] = [];

    //     for (const id of ids) {
    //         if (this.roleCache.has(id)) {
    //             cachedRoles.push(this.roleCache.get(id)!);
    //         } else {
    //             roleIds.push(id);
    //         }
    //     }

    //     try {
    //         const roleRequests = roleIds.map(id =>
    //             this.roleService.findOne(id).toPromise()
    //         );

    //         const fetchedData = (await Promise.all(roleRequests)) ?? [];
    //         const validRoles = fetchedData.filter((res): res is IRole => res !== undefined);
    //         const fetchedRoles = validRoles.map(res => new RoleModel(res));

    //         for (const role of fetchedRoles) {
    //             this.roleCache.set(role.id, role);
    //             cachedRoles.push(role);
    //         }

    //         const finalOrdered = ids
    //             .map(id => this.roleCache.get(id))
    //             .filter((r): r is RoleModel => !!r);

    //         this.currentRole.set(finalOrdered);

    //     } catch (error) {
    //         this.currentRole.set(cachedRoles);
    //     }
    // }
}
