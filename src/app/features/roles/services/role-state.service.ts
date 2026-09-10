import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { IRole } from '../models';
import { RolesService } from './role.service';
import { DynamicDialogRef } from 'primeng/dynamicdialog';

@Injectable({ providedIn: 'root' })
export class RoleStateService extends BaseStateService<IRole> {

    ref!: DynamicDialogRef;

    constructor() {
        super(RolesService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
