import { IUser } from 'app/features/users/models';

export enum AuditAction {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    RESTORE = 'RESTORE',
    ENABLE = 'ENABLE',
    DISABLE = 'DISABLE',
    APPROVE = 'APPROVE',
    REJECT = 'REJECT',
    SUBMIT = 'SUBMIT',
    EVALUATE = 'EVALUATE',
    REVIEW = 'REVIEW',
    FIND_ALL = 'FIND_ALL',
    FIND_ONE = 'FIND_ONE',
    FIND_BY_UUID = 'FIND_BY_UUID',
    LOGIN = 'LOGIN',
    RUNNING = 'RUNNING',
    STOPPED = 'STOPPED',
    OTHER = 'OTHER',
    OBSERVED = 'OBSERVED',
}

export interface IAudit {
    id: number; // Id of the audit record
    userId: number; // Id of the user who performed the action
    user: IUser; // User object
    officerId: number;
    recordId: number; // Id of the record which was audited
    recordType: string; // Name of the table which the record belongs to

    entityId: number; // Id of the entity to which the record belongs
    // entity: IEntity; // Entity object
    action: AuditAction; // Action performed on the record
    description: string; // Description of the action performed
    initialState: any; // Initial state of the record
    delta: any; // Changes made to the record
    ipAddress: string; // IP address of the user who performed the action
    userAgent: string; // User agent of the user who performed the action
    errorDetails: string; // Error details if any
    args: any; // Arguments passed to the action
    createdAt: Date; // Date and time when the action was performed
    updatedAt: Date; // Date and time when the action was updated
    observations: string;
}
