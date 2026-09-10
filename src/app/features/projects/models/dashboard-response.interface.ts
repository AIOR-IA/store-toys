export interface IDashboardActivationGender {
    men: number;
    women: number;
    total: number;
    womenPercent: number;
}

export interface IParticipantsRow {
    code: string;
    men: number;
    women: number;
    boys: number;
    girls: number;
    total: number;
}

export interface IParticipantsTotals {
    men: number;
    women: number;
    boys: number;
    girls: number;
    total: number;
}

export type IMainLanguagesSummary = string[];

export interface ISanitaryTypeCounts {
    NONE: number;
    DRY_TOILET: number;
    PIT_LATRINE: number;
    FLUSH_WATER: number;
}

export interface ISanitationSummary {
    initial: ISanitaryTypeCounts;
    final: ISanitaryTypeCounts;
}

export interface IDashboardResponse {
    scope: { projectId: number; communityId: number | null };

    activation: {
        men: number;
        women: number;
    };

    verification: {
        householdsWithHandwashingStation: number;
        toiletsBuiltWithSahtosoMethodology: number;
    };

    participantsByStage: IParticipantsRow[];
    participantsTotals: IParticipantsTotals;

    ecofamParticipantsTotals: IParticipantsTotals;

    mainLanguages: {
        items: IMainLanguagesSummary
    };
    sanitation: ISanitationSummary;
}
