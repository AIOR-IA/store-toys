import { IRolePermission } from './permission.interface';
import { IRole } from './role.interface';
import { PermissionModel } from './permission.model';

export class RoleModel implements IRole {
    id: number;
    name: string;
    description: string;
    code: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    uuid: string;
    permissions: PermissionModel[] = [];


    constructor(data: IRole) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.code = data.code;
        this.enabled = data.enabled;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
        this.uuid = data.uuid;
        this.setPermissions(data.permissions);
    }


    private setPermissions(permissions: IRolePermission[]) {
        if (!permissions?.length) return;

        this.permissions = permissions.map(
            (permission) => new PermissionModel(permission),
        );
    }
}
