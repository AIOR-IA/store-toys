import { IRolePermission } from './permission.interface';
import { IResource } from './resource.interface';
import { IRole } from './role.interface';

export class PermissionModel implements IRolePermission {
    roleId: number;
    resourceId: number;
    role: IRole;
    resource: IResource;
    permission: number;
    createdAt: Date;
    updatedAt: Date;
    canRead: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canManage: boolean;
    canMaster: boolean;
    canApprove: boolean;

    constructor(data: IRolePermission) {
        this.roleId = data.roleId;
        this.resourceId = data.resourceId;
        this.resource = data.resource;
        this.role = data.role;
        this.permission = data.permission;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
        this.canRead = false;
        this.canCreate = false;
        this.canUpdate = false;
        this.canDelete = false;
        this.canManage = false;
        this.canMaster = false;
        this.canApprove = false;
        this.parsePermissions(data.permission);
    }

    parsePermissions(permission: number) {
        let tmpPermission = permission.toString(2).split('');
        const sizePermission = 8 - tmpPermission.length;
        if (sizePermission > 0) {
            const tmpCerosArray = Array.from(
                { length: sizePermission },
                () => '0',
            );
            tmpPermission = [...tmpCerosArray, ...tmpPermission];
        }
        this.canRead = tmpPermission[6] === '1';
        this.canUpdate = tmpPermission[5] === '1';
        this.canCreate = tmpPermission[4] === '1';
        this.canDelete = tmpPermission[3] === '1';
        this.canManage = tmpPermission[2] === '1';
        this.canMaster = tmpPermission[1] === '1';
        this.canApprove = tmpPermission[0] === '1';
    }
}
