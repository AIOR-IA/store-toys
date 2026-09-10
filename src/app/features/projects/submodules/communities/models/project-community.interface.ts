import { FlowStatus } from '@core/types';
import { IProject } from '../../../models/projects.interface';
import { ICommunity } from './communities.interface';
import { IStage } from './stage.interface';

export interface IProjectCommunity  {
    id: number;
    uuid: string;
    projectId: number;
    project: IProject;

    communityId: number;
    community: ICommunity;

    progress: number;

    stages?: IStage[];


    enabled: boolean;
    createdAt: Date;
    flowStatus: FlowStatus;
}
