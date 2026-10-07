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
