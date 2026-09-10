export type OfflinePcStatus = 'READY' | 'DOWNLOADING' | 'ERROR';

export interface OfflineProjectCommunityRow {
  projectId: number;
  communityId: number;
  userId: number;

  projectCommunityId: number; // SUPER IMPORTANTE (pc.id)
  projectName: string;
  communityName: string;

  // opcional: si quieres mostrar ecofam en la lista offline
  isEcofam: number; // 0/1 para sqlite

  // snapshot completo (stages + attachments + payload)
  projectCommunityJson: string;

  status: OfflinePcStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  error: string | null;
}
