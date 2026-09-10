import { FlowStatus } from '@core/types';
import { IProjectCommunity } from './project-community.interface';
import { IStageAttachment } from './stage-attachment.interface';

export interface IStage  {
    id: number;
    uuid: string;
    projectCommunityId: number;
    projectCommunity: IProjectCommunity;

    code: SahtosoStageEnum;

    activityDate: string;

    men: number;
    women: number;
    boys: number;
    girls: number;

    payload: Record<string, any>;
    attachments: IStageAttachment[];

    isCompleted: boolean;


    enabled: boolean;
    createdAt: Date;
    flowStatus: FlowStatus;
}

export enum SahtosoStageEnum {
    COMMUNITY_DIAGNOSIS = 'COMMUNITY_DIAGNOSIS',
    PRE_ACTIVATION = 'PRE_ACTIVATION',
    ACTIVATION = 'ACTIVATION',
    TECHNICAL_ASPECTS_AND_MONITORING_FORMS = 'TECHNICAL_ASPECTS_AND_MONITORING_FORMS',
    CROQUIS_DEVELOPMENT_AND_UPDATE = 'CROQUIS_DEVELOPMENT_AND_UPDATE',
    HANDWASHING_AND_SAFE_WATER_ACTIVATION = 'HANDWASHING_AND_SAFE_WATER_ACTIVATION',
    SCHOOL_SANITATION_FAIR = 'SCHOOL_SANITATION_FAIR',
    EQUITABLE_PARTICIPATION_AND_GENDER = 'EQUITABLE_PARTICIPATION_AND_GENDER',
    ACTION_PLAN_EVALUATION = 'ACTION_PLAN_EVALUATION',
    VERIFICATION = 'VERIFICATION',
    CERTIFICATION = 'CERTIFICATION',
}
