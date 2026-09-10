import { Component, inject, OnInit, signal } from '@angular/core';
import { BaseFormComponent } from '@shared/components';
import { IResource, IRolePermission } from '../../../models';
import { RolePermissionsService, RoleStateService } from '../../../services';
import { IBaseStateService } from '@core/models';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { Identificable, PaginatedResult } from '@core/types';
import { Validators } from '@angular/forms';
import { catchError } from 'rxjs';

@Component({
    selector: 'app-permission-form',
    templateUrl: './permission-form.component.html',
    styleUrl: './permission-form.component.scss',
})
export class PermissionFormComponent
    extends BaseFormComponent<IRolePermission>
    implements OnInit
{
    override state!: IBaseStateService<IRolePermission>;
    override service = inject(RolePermissionsService);
    roleState = inject(RoleStateService);
    resources = signal({} as PaginatedResult<IResource>);
    isEditMode = false;
    config = inject(DynamicDialogConfig);

    override ngOnInit() {
        super.ngOnInit();
        this.loadResources();
    }

    override buildForm(): void {
        let current = {} as IRolePermission;
        const roleId = this.roleState.current.id;
        const { mode, ...data } = this.config.data || {};
        this.isEditMode = mode === 'update';
        if (this.isEditMode) {
            current = data as IRolePermission;
        }

        this.form = this._fb.group({
            id: [current.resourceId],
            roleId: [current.roleId || roleId],
            resourceId: [current.resourceId, Validators.required],
            canRead: [current.canRead || false],
            canCreate: [current.canCreate || false],
            canUpdate: [current.canUpdate || false],
            canDelete: [current.canDelete || false],
            canManage: [current.canManage || false],
            canMaster: [current.canMaster || false],
            canApprove: [current.canApprove || false],
        });

        if (mode === 'view') {
            this.form.disable();
        }
    }

    get isAdminActivated(): boolean {
        return (
            this.form.get('canMaster')?.value ||
            this.form.get('canManage')?.value
        );
    }

    get isMasterActivated(): boolean {
        return this.form.get('canMaster')?.value;
    }

    loadResources() {
        const roleId = this.roleState.current.id;

        this.service
            .findResources({ perPage: 100, filter: JSON.stringify({ roleId }), page: 1 })
            .subscribe((res) => {
                this.resources.set(res);
                this.buildForm();
            });
    }

    override onSubmit(): void {
        if (this.form.invalid) {
            this.totast.error('app.common.errors.invalidForm');
            return;
        }

        const postData = this.form.value;
        const { id, ...data } = postData;

        const { uuid } = this.roleState.current;

        if (id) {
            this.service
                .update(id, postData)
                .pipe(
                    catchError((error) => {
                        this.totast.error('app.common.messages.notUpdated');
                        return error;
                    }),
                )
                .subscribe((response) => {
                    const resp = response as IRolePermission & Identificable;
                    this.roleState.findItem(uuid).then();
                    this.totast.success('app.common.messages.updated');
                    this.roleState.ref.close();
                });
            return;
        }

        // Create
        this.service
            .create(data)
            .pipe(
                catchError((error) => {
                    this.totast.error('app.common.messages.notCreated');
                    return error;
                }),
            )
            .subscribe((response) => {
                const resp = response as IRolePermission & Identificable;
                this.totast.success('app.common.messages.created');
                this.form.patchValue({ id: resp.resourceId });
                this.roleState.findItem(uuid).then();
                this.roleState.ref.close();
            });
    }
}
