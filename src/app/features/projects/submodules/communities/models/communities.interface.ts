import { FlowStatus } from '@core/types';

export interface ICommunity {
    id: number;
    uuid: string;
    name: string;

    department: string;
    province: string;
    municipality: string;
    cod_mun: string;
    latitude: number;
    longitude: number;
    isEcofam: boolean;

    enabled: boolean;
    createdAt: Date;
    flowStatus: FlowStatus;
}
