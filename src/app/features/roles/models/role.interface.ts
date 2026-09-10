import { IRolePermission } from './permission.interface';

export interface IRole {
    id: number;
    name: string;
    description: string;
    code: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    uuid: string;
    permissions: IRolePermission[];
}
