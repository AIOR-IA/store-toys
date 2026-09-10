import { FlowStatus } from '@core/types';

export abstract class BaseModel<T> {
    id: number;
    uuid: string;
    enabled: boolean;
    createdAt: Date;
    flowStatus: FlowStatus;

    protected constructor(data: any) {
        this.id = data.id;
        this.uuid = data.uuid;
        this.enabled = data.enabled;
        this.createdAt = data.createdAt;
        this.flowStatus = data.flowStatus;
    }

    get isApproved(): boolean {
        return this.flowStatus === FlowStatus.APPROVED;
    }

    get inReview(): boolean {
        return this.flowStatus === FlowStatus.REVIEW;
    }

    get isRejected(): boolean {
        return this.flowStatus === FlowStatus.REJECTED;
    }

    get isArchived(): boolean {
        return this.flowStatus === FlowStatus.ARCHIVED;
    }

    get isDisabled(): boolean {
        return !this.enabled;
    }

    get isEnabled(): boolean {
        return this.enabled;
    }

    get isSubmitted(): boolean {
        return this.flowStatus === FlowStatus.SUBMITTED;
    }

    get isEvaluated(): boolean {
        return this.flowStatus === FlowStatus.EVALUATED;
    }

    get isDraft(): boolean {
        return this.flowStatus === FlowStatus.DRAFT;
    }
}
