import { IAttachment } from '@core/models';
import { IResource, IRole } from '../../features/roles/models';

export type FormModeType = 'create' | 'update' | 'view';

export interface Identificable {
    id: number;
    uuid: string;
}
export type SessionRole = Partial<IRole> & {
    permissions: { permission: number; resource: Partial<IResource> }[];
};

export enum SystemAccessPermissions {
    NONE = 'NONE',
    CAN_READ = 'CAN_READ',
    CAN_UPDATE = 'CAN_UPDATE',
    CAN_CREATE = 'CAN_CREATE',
    CAN_DELETE = 'CAN_DELETE',
    CAN_MANAGE = 'CAN_MANAGE',
    CAN_MASTER = 'CAN_MASTER',
}

export enum DEFAULT_ROLES {
    MASTER_ADMIN = 'MASTER_ADMIN',
    DEFAULT_USER = 'DEFAULT_USER',
    OFFICE_ADMIN = 'OFFICE_ADMIN',
    AGENT_OFFICER = 'AGENT_OFFICER',
    REPRESENTANT = 'REPRESENTANT',
    TECHNNICAL_REVIEWER = 'TECHNNICAL_REVIEWER',
    LEGAL_REVIEWER = 'LEGAL_REVIEWER',
}

export enum FlowStatus {
    DRAFT = 'DRAFT',
    REVIEW = 'REVIEW',
    SUBMITTED = 'SUBMITTED',
    EVALUATED = 'EVALUATED',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    INACTIVE = 'INACTIVE',
    ARCHIVED = 'ARCHIVED',
    RUNNING = 'RUNNING',
    STOPPED = 'STOPPED',
    REQUESTED = 'REQUESTED',
    ASSIGNED = 'ASSIGNED',
    PROGRESS = 'PROGRESS',
    OBSERVED = 'OBSERVED',
}

export const DEFAULT_ENTITY = {
    acronym: 'NINGUNO',
};

export enum SectorType {
    ECONOMIC = 'ECONOMIC',
    PLANIFICATION = 'PLANIFICATION',
}

export enum LevelGeographic {
    REGION = 'REGION',
    CITY = 'CITY',
    PROVINCE = 'PROVINCE',
    MUNICIPALITY = 'MUNICIPALITY',
}

export const FileTypes = {
    PDF: 'application/pdf',
    EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    WORD: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    IMAGE: 'image/*',
    SHAPE: '.zip',
    KML: '.kml',
    RAR: '.rar',
    CSV: '.csv',
} as const;

export type FileTypeKey = keyof typeof FileTypes;
export type FileTypeValue = (typeof FileTypes)[FileTypeKey];

export enum Frequency {
    NONE = 'NONE',
    MONTHLY = 'MONTHLY',
    BIMONTHLY = 'BIMONTHLY',
    QUARTERLY = 'QUARTERLY',
    BIANNUALLY = 'BIANNUALLY',
    ANNUALLY = 'ANNUALLY',
    EVERY_5_YEARS = 'EVERY_5_YEARS',
    EVERY_10_YEARS = 'EVERY_10_YEARS',
    EVERY_15_YEARS = 'EVERY_15_YEARS',
    EVERY_20_YEARS = 'EVERY_20_YEARS',
    EVERY_25_YEARS = 'EVERY_25_YEARS',
    OTHER = 'OTHER',
}

export enum FrequencyIndicators {
    NONE = 'NONE',
    MONTHLY = 'MONTHLY',
    BIMONTHLY = 'BIMONTHLY',
    QUARTERLY = 'QUARTERLY',
    BIANNUALLY = 'BIANNUALLY',
    ANNUALLY = 'ANNUALLY',
}

export type FrequencyUnit = 'MONTH' | 'YEAR' | 'DAY' | 'WEEK';

export enum ContentPieceFieldType {
    TEXT = 'TEXT',
    IMAGE = 'IMAGE',
    FILE = 'FILE',
    SYSTEM = 'SYSTEM',
}

export enum IndicatorRule {
    PM = 'PM', // Acumulative percentage
    PS = 'PS', // Summarize percentage
    NM = 'NM', // Acumulative number
    NS = 'NS', // Summarize number
    PP = 'PP', // Average Percentage
}

export type IndicatorRuleType = 'ACCUMULATIVE' | 'SUMMARIZE' | 'AVERAGE';
export enum IndicatorRuleEnum {
    ACCUMULATIVE = 'ACCUMULATIVE',
    SUMMARIZE = 'SUMMARIZE',
    AVERAGE = 'AVERAGE',
}

export const ENTITY_NONE_ACRONYM = 'NINGUNO';

export const CURRENT_ROLE_ID_KEY = 'currentRoleId';

export enum UserType {
    EMPLOYEE = 'EMPLOYEE',
    AUXILIAR_OFFICER = 'AUXILIAR_OFFICER',
}

export enum DocumentType {
    NONE = 'NONE',
    PROFESSIONAL_TITLE = 'PROFESSIONAL_TITLE',
    CI = 'CI',
    CV = 'CV',
    FORM25 = 'FORM25',
    PAYMENT = 'PAYMENT',
    SIGNED_REQUEST = 'SIGNED_REQUEST',
    APPROVED_RESOLUTION = 'APPROVED_RESOLUTION',
    SIGNED_APPROVED_RESOLUTION = 'SIGNED_APPROVED_RESOLUTION',
    TECHNICAL_REPORT = 'TECHNICAL_REPORT',
    SIGNED_TECHNICAL_REPORT = 'SIGNED_TECHNICAL_REPORT',
    NOTIFICATION_DOCUMENT = 'NOTIFICATION_DOCUMENT',
}

export type ApiErrorResponseType = {
    success: false;
    statusCode: number;
    message: string;
    error: string;
    timestamp: string;
};
export const ApiResponseMessages = {
    CANNOT_BE_DELETED: 'CANNOT BE DELETED',
    ACCESS_TIME_HAS_EXPIRED: 'ACCESS TIME HAS EXPIRED',
};

export const parseFile = (file: IAttachment | undefined): IAttachment[] => {
    if (!file) return [];
    return [file];
};

export type SldClassifier = {
    value: string;
    color: string;
    title: string;
};
export type SldFile = {
    name: string; // Name of the SLD to upload into geoserver
    filename: string; // Original filename
    columns: string[]; // Available columns in the dataset
    classifiers: SldClassifier[]; // Classifiers for styling
}

export type InstrumentClassification = {
    classifier: string; //Columns name used for classification
    sld: SldFile; // SLD file associated with the classification
}
