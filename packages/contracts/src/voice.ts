import type { PendingProposal, ProposalRisk } from './voice-context.js';

/**
 * The voice stream protocol (V1, spec section H): one WebSocket per clinician, audio in, events
 * out. Shared by the browser and the server, so it stays free of runtime dependencies.
 *
 * Connecting: POST /v1/voice/tickets, then open WS /v1/voice/stream with the subprotocols
 * [VOICE_PROTOCOL, VOICE_TICKET_PREFIX + ticket]. A browser cannot set headers on a WebSocket,
 * and a subprotocol keeps the ticket out of URLs and access logs. The server answers with
 * VOICE_PROTOCOL only.
 *
 * Surviving a blip: everything the client sends after hello carries a sequence number, audio
 * frames and control messages alike. The client keeps what the server has not acknowledged.
 * After a drop it reconnects with a new ticket and hello { streamId }; the server, which keeps
 * the stream for a grace period, answers with the next sequence it expects, and the client
 * resends from there. The server ignores what it already has, so nothing is lost or doubled.
 */

export const VOICE_PROTOCOL = 'dental.voice.v1';
export const VOICE_TICKET_PREFIX = 'ticket.';
export const VOICE_SAMPLE_RATE = 16_000;
/** 20 ms of 16 kHz mono: 320 samples. */
export const VOICE_FRAME_SAMPLES = 320;
/** Lifetime of a ticket. */
export const VOICE_TICKET_SECONDS = 30;

/** WebSocket close codes the server uses; the client reconnects on all but `refused`. */
export const VOICE_CLOSE = {
  /** Nothing arrived for too long; the stream is gone. */
  idle: 4000,
  /** The access token behind the ticket expired; resume with a fresh ticket. */
  expired: 4001,
  /** The same stream was resumed on another socket. */
  replaced: 4002,
  /** The client broke the protocol. */
  protocol: 4003,
  /** The stream belongs to someone else. */
  refused: 4004,
} as const;

/** POST /v1/voice/tickets */
export interface VoiceTicketResponse {
  ticket: string;
  expiresAt: string;
}

export type VoiceClientMessage =
  | { type: 'hello'; streamId?: string }
  | { type: 'utterance.start'; seq: number; utteranceId: string }
  | { type: 'utterance.end'; seq: number; utteranceId: string };

export type VoiceServerMessage =
  | {
      type: 'ready';
      streamId: string;
      /** Whether an existing stream was picked up; if not, the client starts again at 0. */
      resumed: boolean;
      /** The first sequence number the server does not have yet. */
      nextSeq: number;
      /** When the stream will close with VOICE_CLOSE.expired. */
      expiresAt: string;
      /** Whether speech is transcribed; false when no speech provider is configured. */
      speech: boolean;
    }
  /** Everything up to and including seq has arrived. */
  | { type: 'ack'; seq: number }
  | { type: 'utterance.started'; utteranceId: string }
  | {
      type: 'utterance.ended';
      utteranceId: string;
      frames: number;
      durationMs: number;
    }
  /** What has been recognised so far in the utterance; replaced by each new partial. */
  | { type: 'transcript.partial'; utteranceId: string; text: string }
  /** The finished transcript of an utterance. Kept and resent if the socket was down. */
  | {
      type: 'transcript.final';
      utteranceId: string;
      text: string;
      /** Mean provider confidence, 0 to 1; 0 when nothing was heard. */
      confidence: number;
      /** From the end of the utterance to the final transcript. */
      finalizeMs: number;
    }
  /** What the utterance was understood as (V4); a valid intent is now the pending proposal. */
  | { type: 'interpretation'; utteranceId: string; interpretation: VoiceInterpretation }
  | { type: 'error'; code: string; message: string };

/** First byte of a binary message. */
export const AUDIO_FRAME = 1;
const HEADER_BYTES = 5;

/** [AUDIO_FRAME][seq: uint32 big-endian][PCM16 little-endian samples] */
export function encodeAudioFrame(seq: number, samples: Int16Array): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + samples.length * 2);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, AUDIO_FRAME);
  view.setUint32(1, seq);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(HEADER_BYTES + i * 2, samples[i]!, true);
  }
  return bytes;
}

/** Null for anything that is not a well-formed audio frame. */
export function decodeAudioFrame(data: Uint8Array): { seq: number; samples: Int16Array } | null {
  if (data.byteLength < HEADER_BYTES + 2 || (data.byteLength - HEADER_BYTES) % 2 !== 0) {
    return null;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint8(0) !== AUDIO_FRAME) return null;
  const samples = new Int16Array((data.byteLength - HEADER_BYTES) / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(HEADER_BYTES + i * 2, true);
  }
  return { seq: view.getUint32(1), samples };
}

/**
 * What an utterance was understood as (V4). Entities are as spoken; they are resolved to ids
 * and checked in the next step (V5) before anything can be confirmed (V6).
 */
export interface VoiceInterpretation {
  id: string;
  utteranceId: string;
  /**
   * intent: a command; control: yes, no, a correction or undo for the pending proposal (V6);
   * none: not a command; rejected: invalid model output; failed: no answer.
   */
  outcome: 'intent' | 'control' | 'none' | 'rejected' | 'failed';
  command: string | null;
  entities: Record<string, string>;
  /** Required entities that were not said. */
  missing: string[];
  /** Entities the model returned that were not in what was said; never kept. */
  dropped: string[];
  confidence: number | null;
  reason: string | null;
  provider: string;
  model: string;
  promptVersion: number;
  contextVersion: number;
  /** Whether it became the pending proposal; not when the context moved on meanwhile. */
  proposed: boolean;
  /** The command it resolves to (V5); present for an intent and a correction. */
  proposal: ResolvedProposal | null;
  /** How the proposal must be confirmed (V6). */
  risk: ProposalRisk | null;
  /** What a spoken control did (V6). */
  control: VoiceControlResult | null;
  /** What is now waiting for confirmation, after this utterance; null when nothing is. */
  pending: PendingProposal | null;
}

/** The result of "yes", "no", a correction or "undo" said to the pending proposal (V6). */
export interface VoiceControlResult {
  action: 'confirm' | 'cancel' | 'correct' | 'undo';
  ok: boolean;
  /** For the clinician, such as "Signing needs a click on screen." */
  message: string;
  /** The command run, when a confirmation executed one. */
  commandId?: string;
}

/** POST /v1/voice/proposals/:id/confirm */
export interface VoiceConfirmRequest {
  /** The context version the clinician saw the proposal under. */
  contextVersion: number;
}

export interface VoiceConfirmResponse {
  commandId: string;
  command: string;
  result: unknown;
}

/** POST /v1/voice/proposals/:id/edit: entities typed on the card, resolved like speech. */
export interface VoiceEditRequest {
  contextVersion: number;
  entities: Record<string, string>;
}

/** One field of a proposal, as the clinician will see it on the card. */
export interface ProposalField {
  /** The payload key it fills, such as "tooth" or "procedureCode". */
  key: string;
  /** For display, such as "16" or "Root canal treatment, molar". */
  value: string;
  /** "speech": from the clinician's words; "context": from what is on screen, and labelled so. */
  resolvedFrom: 'speech' | 'context';
  /** The words it came from, when spoken. */
  said?: string;
}

/**
 * A command resolved from an interpretation (V5): entities turned into ids, codes and numbers
 * in code, context filled in openly. It is ready when nothing is missing, nothing is
 * ambiguous, and the payload passes the command's own schema.
 */
export interface ResolvedProposal {
  command: string;
  payload: Record<string, unknown>;
  fields: ProposalField[];
  /** Entities still to be said, such as "tooth". */
  missing: string[];
  /** Why it cannot run as it stands, in words for the clinician. */
  problems: string[];
  /** Other readings of an ambiguous entity, such as two procedures called "filling". */
  alternatives: { key: string; options: string[] }[];
  ready: boolean;
}

/** POST /v1/voice/interpret */
export interface VoiceInterpretRequest {
  text: string;
  /** An interpreter configured on the server; the default when left out. */
  interpreter?: string;
}
