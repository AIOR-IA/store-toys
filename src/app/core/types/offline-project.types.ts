export type OfflineStatus = 'READY' | 'DOWNLOADING' | 'ERROR';

export interface OfflineProjectRow {
  projectId: number;
  userId: number;

  name: string;
  totalsJson: string | null;

  status: OfflineStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  error: string | null;
}
