import { IResource } from './resource.interface';
import { IRole } from './role.interface';

export interface IRolePermission {
    roleId: number; // Id of the role
    resourceId: number; // Id of the resource
    resource: IResource; // Resource object
    role: IRole; // Role object
    permission: number; // Permission of the role on the resource
    createdAt: Date; // Date and time when the record was created
    updatedAt: Date; // Date and time when the record was updated

    canRead: boolean; // Whether the role can read the resource
    canCreate: boolean; // Whether the role can create the resource
    canUpdate: boolean; // Whether the role can update the resource
    canDelete: boolean; // Whether the role can delete the resource
    canManage: boolean; // Whether the role can manage the resource
    canMaster: boolean; // Whether the role can master the resource
    canApprove: boolean; // Whether the role can approve the resource
}
