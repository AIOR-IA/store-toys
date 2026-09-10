import { FilterTabOption } from '@shared/components';
import { environment } from 'environments/environment';

export const GRID_VIEW = 'GRID_VIEW';
export const LIST_VIEW = 'LIST_VIEW';
export const TREE_VIEW = 'TREE_VIEW';
export const RESOURCES = {
    NONE: 'NONE',
    AUDIT: 'AUDIT',
    USERS: 'USERS',
    PROFILE: 'PROFILE',
    ROLES: 'ROLES',
    GEOGRAPHIC_LAYER: 'GEOGRAPHIC_LAYER',
    PROJECT: 'PROJECT',
    STAGE: 'STAGE',
    DASHBOARD: 'DASHBOARD'
};
export const DEBOUNCE_TIME = 300;

export const AllOption: FilterTabOption<any> = {
    label: 'Todos',
    value: { id: 0 },
    icon: '',
};

export enum UserContextEnum {
    USER = 'USER',
    AGENT_OFFICER = 'AGENT_OFFICER',
    REPRESENTANT = 'REPRESENTANT',
}

export type UserContextType = keyof typeof UserContextEnum;

export const Cities = ['LP', 'OR', 'CB', 'BN', 'PD', 'PT', 'SC', 'TJ', 'CH'];
export const DefaultDepartment = 'SANTA CRUZ';

export const GenericPointSld = 'generic-point-style';
