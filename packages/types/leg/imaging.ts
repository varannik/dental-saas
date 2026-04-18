import type { ISODateTime, UUID } from '../src/tenancy.js';

export const IMAGING_MODALITIES = ['INTRAORAL', 'PANORAMIC', 'CBCT', 'PHOTO', 'VIDEO'] as const;
export type ImagingModality = (typeof IMAGING_MODALITIES)[number];

export const IMAGING_OBJECT_TYPES = ['DICOM', 'JPEG', 'PNG', 'STL', 'MP4'] as const;
export type ImagingObjectType = (typeof IMAGING_OBJECT_TYPES)[number];

export interface ImagingStudy {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  encounterId: UUID | null;
  studyUid: string | null;
  modality: ImagingModality;
  bodyPart: string | null;
  acquisitionDatetime: ISODateTime | null;
  sourceSystem: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ImagingObject {
  id: UUID;
  studyId: UUID;
  seriesId: UUID | null;
  sopInstanceUid: string | null;
  objectType: ImagingObjectType;
  storageUri: string;
  hash: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  depthSlices: number | null;
  isOriginal: boolean;
  processingPipeline: Record<string, unknown> | null;
  createdAt: ISODateTime;
}

export interface AIPrediction {
  id: UUID;
  jobId: UUID;
  tenantId: UUID;
  patientId: UUID | null;
  imagingObjectId: UUID | null;
  predictionType: string;
  code: string | null;
  confidence: number | null;
  severity: string | null;
  roiAnnotationId: UUID | null;
  rawOutput: Record<string, unknown> | null;
  createdAt: ISODateTime;
}
