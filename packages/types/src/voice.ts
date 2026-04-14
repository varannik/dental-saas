import type { ISODateTime, UUID } from './tenancy';

export const VOICE_CHANNELS = ['MOBILE_APP', 'BROWSER', 'PHONE', 'DEVICE'] as const;
export type VoiceChannel = (typeof VOICE_CHANNELS)[number];

export const VOICE_SPEAKERS = ['USER', 'PATIENT', 'AGENT'] as const;
export type VoiceSpeaker = (typeof VOICE_SPEAKERS)[number];

export const RECORDING_STORAGE_CLASSES = ['HOT', 'ARCHIVE'] as const;
export type RecordingStorageClass = (typeof RECORDING_STORAGE_CLASSES)[number];

export interface VoiceSession {
  id: UUID;
  tenantId: UUID;
  userId: UUID | null;
  patientId: UUID | null;
  encounterId: UUID | null;
  channel: VoiceChannel;
  inputLocale: string | null;
  outputLocale: string | null;
  asrLanguage: string | null;
  ttsVoiceId: string | null;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  meta: Record<string, unknown> | null;
}

export interface VoiceUtterance {
  id: UUID;
  sessionId: UUID;
  sequenceNo: number;
  speaker: VoiceSpeaker;
  transcript: string | null;
  transcriptLocale: string | null;
  normalizedTranscript: string | null;
  isFinal: boolean;
  intent: string | null;
  entities: Record<string, unknown> | null;
  createdAt: ISODateTime;
}

export interface VoiceRecording {
  id: UUID;
  sessionId: UUID;
  utteranceId: UUID | null;
  tenantId: UUID;
  audioUri: string;
  format: string;
  durationMs: number | null;
  sampleRateHz: number | null;
  isRedacted: boolean;
  storageClass: RecordingStorageClass;
  retentionUntil: ISODateTime | null;
  createdAt: ISODateTime;
}
