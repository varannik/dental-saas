import type { ISODateTime, JsonObject, UUID } from './tenancy.js';

export interface ImagingStudy {
  id: UUID;
  tenantId: UUID;
  patientId: UUID;
  encounterId: UUID | null;
  studyUid: string | null;
  modality: string;
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
  objectType: string;
  storageUri: string;
  hash: string | null;
  byteSize: unknown | null;
  width: number | null;
  height: number | null;
  depthSlices: number | null;
  isOriginal: boolean;
  processingPipeline: JsonObject | null;
  createdAt: ISODateTime;
}

export interface ImageAnnotation {
  id: UUID;
  tenantId: UUID;
  imagingObjectId: UUID;
  annotationType: string;
  annotationData: JsonObject;
  createdByUserId: UUID | null;
  createdAt: ISODateTime;
}

export interface AIModel {
  id: UUID;
  name: string;
  domain: string;
  vendor: string;
  regulatoryClass: string;
  createdAt: ISODateTime;
}

export interface AIModelVersion {
  id: UUID;
  modelId: UUID;
  versionTag: string;
  artifactUri: string;
  inputTypes: string[];
  outputTypes: string[];
  performanceMetrics: JsonObject | null;
  validatedOn: ISODateTime | null;
  validationSummaryUri: string | null;
  sbomUri: string | null;
  createdAt: ISODateTime;
}

export interface AIInferenceJob {
  id: UUID;
  tenantId: UUID;
  modelVersionId: UUID;
  inputType: string;
  inputRefId: UUID;
  requestedByUserId: UUID | null;
  status: string;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  computeEnv: JsonObject | null;
  errorDetails: string | null;
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
  rawOutput: JsonObject | null;
  createdAt: ISODateTime;
}
