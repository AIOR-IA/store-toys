import { FlowStatus } from '@core/types';

export interface ITheme {
    id: number;
    title: string;
    icon: string;
    description: string;
    enabled: boolean;
    createdAt: Date;
    color: string;
}
