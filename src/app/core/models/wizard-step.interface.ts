export interface IWizardStep {
    step: number;
    text: string;
    icon?: string;
    path: string;
    active?: boolean;
    steps?: IWizardStep[];
}
