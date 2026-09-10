import { IUser } from './user.interface';
import { IRole, IRoleUser } from '../../roles/models';
import { FlowStatus, UserType } from '@core/types';

export class User implements IUser {
    id: number;
    name: string;
    firstName: string;
    paternalLastName: string;
    maternalLastName: string;
    username: string;
    email: string;
    password: string;
    roleUsers: IRoleUser[];
    accountConfirmEmailSentAt: Date;
    accountConfirmedAt: Date;
    roleId: number;
    role: IRole;
    enabled: boolean;
    flowStatus: FlowStatus;
    uuid: string;

    constructor(user: IUser) {
        this.id = user.id;
        this.name = user.name;
        this.username = user.username;
        this.password = user.password;
        this.email = user.email;
        this.roleId = user.roleId;
        this.enabled = user.enabled;
        this.firstName = user.firstName;
        this.paternalLastName = user.paternalLastName;
        this.maternalLastName = user.maternalLastName;
        this.uuid = user.uuid;
        this.roleUsers = user.roleUsers || [];
        this.flowStatus = user.flowStatus;
        this.accountConfirmEmailSentAt = user.accountConfirmEmailSentAt;
        this.accountConfirmedAt = user.accountConfirmedAt;
        this.role = user.role;
    }

    get fullName(): string {
        let name = this.name || this.firstName;
        return `${name} ${this.paternalLastName} ${
            this.maternalLastName ?? ''
        }`;
    }

    get isApproved(): boolean {
        return this.flowStatus === FlowStatus.APPROVED;
    }

    get isRejected(): boolean {
        return this.flowStatus === FlowStatus.REJECTED;
    }

    get isInReview(): boolean {
        return this.flowStatus === FlowStatus.REVIEW;
    }

    get accountConfirmed(): boolean {
        return !!this.accountConfirmedAt;
    }

    get accountConfirmEmailSent(): boolean {
        return !!this.accountConfirmEmailSentAt;
    }

    set isResponsible(value: boolean) {}
}
