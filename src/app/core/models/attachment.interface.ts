export interface IAttachment {
    id: number;
    key: string;
    filename: string;
    contentType: string;
    publicUrl: string;
    sizeBytes: number;
    createdAt?: Date;
    createdById?: number;
    previewUrl?: string;
}
