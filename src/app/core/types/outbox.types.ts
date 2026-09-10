export type OutboxType = 'STAGE_UPDATE' | 'IMAGE_UPLOAD';
export type OutboxStatus = 'PENDING' | 'DONE' | 'ERROR';

export type StageUpdateOutboxPayload = {
  stageId: number;
  data: {
    activityDate?: string | null;
    men?: number | null;
    women?: number | null;
    boys?: number | null;
    girls?: number | null;
    payload?: Record<string, any>;
    isCompleted?: boolean;
  };
};

export type ImageUploadOutboxPayload = {
  stageId: number;
  tag: string;
  localPath: string;
  fileName: string;
  mimeType: string;
};

export interface OutboxItem<TPayload = any> {
  id: string;
  type: OutboxType;
  status: OutboxStatus;
  createdAt: number;
  payload: TPayload;
  error?: string | null;
}
