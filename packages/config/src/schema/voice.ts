import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { encounters, patients } from './clinical.js';
import { tenants, users } from './tenancy.js';

export const voiceSessions = pgTable(
  'voice_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id').references(() => users.id),
    patientId: uuid('patient_id').references(() => patients.id),
    encounterId: uuid('encounter_id').references(() => encounters.id),
    channel: text('channel').notNull(),
    inputLocale: text('input_locale'),
    outputLocale: text('output_locale'),
    asrLanguage: text('asr_language'),
    ttsVoiceId: text('tts_voice_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    meta: jsonb('meta').$type<Record<string, unknown> | null>(),
  },
  (table) => [index('idx_voice_sessions_tenant_time').on(table.tenantId, table.startedAt)]
);

export const voiceUtterances = pgTable(
  'voice_utterances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => voiceSessions.id),
    sequenceNo: integer('sequence_no').notNull(),
    speaker: text('speaker').notNull(),
    transcript: text('transcript'),
    transcriptLocale: text('transcript_locale'),
    normalizedTranscript: text('normalized_transcript'),
    isFinal: boolean('is_final').notNull().default(true),
    intent: text('intent'),
    entities: jsonb('entities').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_voice_utterances_session_seq').on(table.sessionId, table.sequenceNo)]
);

export const voiceRecordings = pgTable(
  'voice_recordings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => voiceSessions.id),
    utteranceId: uuid('utterance_id').references(() => voiceUtterances.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    audioUri: text('audio_uri').notNull(),
    format: text('format').notNull(),
    durationMs: integer('duration_ms'),
    sampleRateHz: integer('sample_rate_hz'),
    isRedacted: boolean('is_redacted').notNull().default(false),
    storageClass: text('storage_class').notNull().default('HOT'),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_voice_recordings_tenant_session').on(table.tenantId, table.sessionId)]
);
