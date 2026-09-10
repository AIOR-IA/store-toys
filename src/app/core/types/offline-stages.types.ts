
import { SahtosoStageEnum } from 'app/features/projects/submodules/communities/models/stage.interface';

export type OfflineStageRow = {
  stageId: number;
  userId: number;

  projectCommunityId: number;

  code: SahtosoStageEnum | string;

  activityDate?: string | null;
  men?: number | null;
  women?: number | null;
  boys?: number | null;
  girls?: number | null;

  payloadJson?: string | null;
  attachmentsJson?: string | null;

  isCompleted: '0' | '1' | 0 | 1 | boolean;
  createdAt: number;
  updatedAt: number;

  expiresAt: number;
  error?: string | null;
};

export type OfflineStageDto = {
  id: number;
  projectCommunityId: number;
  code: SahtosoStageEnum;

  activityDate?: string | null;
  men?: number | null;
  women?: number | null;
  boys?: number | null;
  girls?: number | null;

  payload?: any; // JSON parse
  attachments?: any[]; // opcional

  isCompleted: boolean;
};
