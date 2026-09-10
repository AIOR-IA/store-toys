import { FlowStatus } from "@core/types";
import { IAttachment } from '../../../../../core/models/attachment.interface';
import { IStage } from "./stage.interface";

export interface IStageAttachment {
  id: number;
  stage: IStage;
  stageId: number;
  file_imageId: number;
  file_image: IAttachment;

  tag: string;

  enabled?: boolean;
  flowStatus?: FlowStatus;

  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}
