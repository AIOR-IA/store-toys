import { IRole, IRoleUser } from '../../roles/models';
import { FlowStatus, UserType } from '@core/types';

export interface IUser {
    id: number;
    name: string;
    firstName: string;
    paternalLastName: string;
    maternalLastName: string;
    username: string;
    email: string;
    password: string;
    accountConfirmEmailSentAt: Date;
    accountConfirmedAt: Date;
    roleUsers: IRoleUser[];
    roleId: number;
    role: IRole;
    enabled: boolean;
    flowStatus: FlowStatus;
    uuid: string;
}
