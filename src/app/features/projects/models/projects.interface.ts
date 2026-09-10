import { FlowStatus } from '@core/types';
import { IUser } from 'app/features/users/models';
import { IProjectCommunity } from '../submodules/communities/models';

export interface IProjectTotals {
  totalCommunities: number;
  ecofamCertified: number;
  notCertified: number;
}

export interface IProject {
    id: number;
    uuid: string;
    name: string;
    userId: number;
    user: IUser;
    enabled: boolean;
    projectCommunities: IProjectCommunity[];
    totals?: IProjectTotals;
    createdAt: Date;
    flowStatus: FlowStatus;
}
