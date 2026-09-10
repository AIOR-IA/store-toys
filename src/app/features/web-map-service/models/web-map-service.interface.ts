import { FlowStatus } from '@core/types';

export interface IWebMapService {
    id: number;
    url: string;
    layer: string;
    label: string;
    group: string;
    description: string;
    opacity: number;
    enabled: boolean;
    createdAt: Date;
}
