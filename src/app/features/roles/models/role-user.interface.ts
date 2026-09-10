import { IRole } from './role.interface';
import { IUser } from '../../users/models';

export interface IRoleUser {
    roleId: number;
    userId: number;
    user: IUser;
    role: IRole;
    createdAt: Date;
}
