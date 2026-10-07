import {
  decodeAudioFrame,
  VOICE_CLOSE,
  VOICE_SAMPLE_RATE,
  type VoiceServerMessage,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import type { FastifyBaseLogger } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import type { TicketHolder } from './tickets.js';

/**
 * Voice streams (V1). A stream outlives its socket: when the socket drops, the stream waits
 * a grace period for the same user to resume it on a new socket, so a network blip loses no
 * audio. Everything the client sends after hello carries a sequence number; the stream applies
 * each number once, in order, and acknowledges what it has. See packages/contracts/src/voice.ts.
 *
 * Streams live in this process. Several API processes would need sticky routing by stream id.
 */

/** Where audio goes. Speech-to-text plugs in here (V2). */
export interface StreamSink {
  utteranceStart(utteranceId: string): void;
  audio(samples: Int16Array): void;
  utteranceEnd(utteranceId: string): void;
  close(): void;
}

export interface StreamTimings {
  /** How long a dropped stream waits to be resumed. */
  graceMs: number;
  /** A stream with no messages for this long is closed for good. */
  idleMs: number;
  /** Ping interval; a socket that misses one pong is dropped. */
  pingMs: number;
  /** Hello must arrive within this. */
  helloMs: number;
  /** Audio is acknowledged at least this often. */
  ackDelayMs: number;
}

export const DEFAULT_TIMINGS: StreamTimings = {
  graceMs: 30_000,
  idleMs: 5 * 60_000,
  pingMs: 15_000,
  helloMs: 5_000,
  ackDelayMs: 200,
};

const ACK_EVERY_FRAMES = 10;
const MAX_UTTERANCE_ID = 64;

interface Utterance {
  id: string;
  frames: number;
  samples: number;
}

class VoiceStream {
  readonly id = uuidv7();
  nextSeq = 0;
  socket: WebSocket | null = null;
  utterance: Utterance | null = null;
  lastActivity = Date.now();
  unacked = 0;
  ackTimer: NodeJS.Timeout | null = null;
  graceTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly owner: TicketHolder,
    readonly sink: StreamSink | null
  ) {}
}

type Control =
  | { type: 'utterance.start'; seq: number; utteranceId: string }
  | { type: 'utterance.end'; seq: number; utteranceId: string };

function parseText(data: RawData): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(data.toString());
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseControl(message: Record<string, unknown>): Control | null {
  const { type, seq, utteranceId } = message;
  if (type !== 'utterance.start' && type !== 'utterance.end') return null;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0 || seq > 0xffffffff) {
    return null;
  }
  if (
    typeof utteranceId !== 'string' ||
    utteranceId.length === 0 ||
    utteranceId.length > MAX_UTTERANCE_ID
  ) {
    return null;
  }
  return { type, seq, utteranceId };
}

const toBytes = (data: RawData): Uint8Array =>
  Array.isArray(data)
    ? new Uint8Array(Buffer.concat(data))
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

export class StreamRegistry {
  private readonly streams = new Map<string, VoiceStream>();
  private readonly timings: StreamTimings;

  constructor(
    private readonly options: {
      log: FastifyBaseLogger;
      timings?: Partial<StreamTimings>;
      createSink?: (owner: TicketHolder) => StreamSink;
    }
  ) {
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
  }

  get size() {
    return this.streams.size;
  }

  /** Takes a socket whose ticket has been checked, and waits for hello. */
  accept(socket: WebSocket, holder: TicketHolder) {
    let stream: VoiceStream | null = null;
    let alive = true;

    const send = (message: VoiceServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const close = (code: number, reason: string) => {
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
        socket.close(code, reason);
      }
    };

    const helloTimer = setTimeout(
      () => close(VOICE_CLOSE.protocol, 'hello expected'),
      this.timings.helloMs
    );
    const expiryTimer = setTimeout(
      () => close(VOICE_CLOSE.expired, 'access expired'),
      Math.max(0, holder.accessExpiresAt.getTime() - Date.now())
    );
    const heartbeat = setInterval(() => {
      if (stream && Date.now() - stream.lastActivity > this.timings.idleMs) {
        const idle = stream;
        stream = null;
        this.dispose(idle);
        close(VOICE_CLOSE.idle, 'idle');
        return;
      }
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, this.timings.pingMs);
    socket.on('pong', () => {
      alive = true;
    });

    const hello = (message: Record<string, unknown>) => {
      clearTimeout(helloTimer);
      const wanted = typeof message.streamId === 'string' ? message.streamId : undefined;
      const existing = wanted ? this.streams.get(wanted) : undefined;
      if (
        existing &&
        (existing.owner.userId !== holder.userId || existing.owner.clinicId !== holder.clinicId)
      ) {
        close(VOICE_CLOSE.refused, 'not your stream');
        return;
      }
      if (existing) {
        if (existing.graceTimer) clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
        const previous = existing.socket;
        existing.socket = socket;
        if (previous && previous !== socket)
          previous.close(VOICE_CLOSE.replaced, 'resumed elsewhere');
        stream = existing;
      } else {
        stream = new VoiceStream(holder, this.options.createSink?.(holder) ?? null);
        stream.socket = socket;
        this.streams.set(stream.id, stream);
      }
      stream.lastActivity = Date.now();
      send({
        type: 'ready',
        streamId: stream.id,
        resumed: Boolean(existing),
        nextSeq: stream.nextSeq,
        expiresAt: holder.accessExpiresAt.toISOString(),
      });
    };

    const ack = (current: VoiceStream, now: boolean) => {
      current.unacked += 1;
      if (now || current.unacked >= ACK_EVERY_FRAMES) {
        if (current.ackTimer) clearTimeout(current.ackTimer);
        current.ackTimer = null;
        current.unacked = 0;
        send({ type: 'ack', seq: current.nextSeq - 1 });
      } else if (!current.ackTimer) {
        current.ackTimer = setTimeout(() => {
          current.ackTimer = null;
          current.unacked = 0;
          if (current.socket === socket) send({ type: 'ack', seq: current.nextSeq - 1 });
        }, this.timings.ackDelayMs);
      }
    };

    /** Applies seq once and in order; a gap means the client lost track, which is fatal. */
    const sequenced = (current: VoiceStream, seq: number, now: boolean, apply: () => void) => {
      if (seq < current.nextSeq) {
        ack(current, true);
        return;
      }
      if (seq > current.nextSeq) {
        close(VOICE_CLOSE.protocol, `expected ${current.nextSeq}`);
        return;
      }
      apply();
      current.nextSeq += 1;
      ack(current, now);
    };

    const control = (current: VoiceStream, message: Control) => {
      sequenced(current, message.seq, true, () => {
        if (message.type === 'utterance.start') {
          if (current.utterance) this.endUtterance(current, send);
          current.utterance = { id: message.utteranceId, frames: 0, samples: 0 };
          current.sink?.utteranceStart(message.utteranceId);
          send({ type: 'utterance.started', utteranceId: message.utteranceId });
        } else if (current.utterance?.id === message.utteranceId) {
          this.endUtterance(current, send);
        }
      });
    };

    socket.on('message', (data, isBinary) => {
      if (!stream) {
        const message = isBinary ? null : parseText(data);
        if (message?.type === 'hello') hello(message);
        else close(VOICE_CLOSE.protocol, 'hello expected');
        return;
      }
      const current = stream;
      // A socket the stream has moved away from no longer speaks for it.
      if (current.socket !== socket) return;
      current.lastActivity = Date.now();
      if (isBinary) {
        const frame = decodeAudioFrame(toBytes(data));
        if (!frame) {
          close(VOICE_CLOSE.protocol, 'bad audio frame');
          return;
        }
        sequenced(current, frame.seq, false, () => {
          if (!current.utterance) return;
          current.utterance.frames += 1;
          current.utterance.samples += frame.samples.length;
          current.sink?.audio(frame.samples);
        });
        return;
      }
      const message = parseText(data);
      const parsed = message ? parseControl(message) : null;
      if (!parsed) {
        close(VOICE_CLOSE.protocol, 'unknown message');
        return;
      }
      control(current, parsed);
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      clearTimeout(expiryTimer);
      clearInterval(heartbeat);
      const current = stream;
      if (!current || current.socket !== socket) return;
      current.socket = null;
      if (current.ackTimer) clearTimeout(current.ackTimer);
      current.ackTimer = null;
      current.graceTimer = setTimeout(() => this.dispose(current), this.timings.graceMs);
    });

    socket.on('error', (error) => {
      this.options.log.warn({ err: error }, 'voice socket error');
    });
  }

  private endUtterance(stream: VoiceStream, send: (message: VoiceServerMessage) => void) {
    const utterance = stream.utterance;
    if (!utterance) return;
    stream.utterance = null;
    stream.sink?.utteranceEnd(utterance.id);
    send({
      type: 'utterance.ended',
      utteranceId: utterance.id,
      frames: utterance.frames,
      durationMs: Math.round((utterance.samples / VOICE_SAMPLE_RATE) * 1000),
    });
  }

  private dispose(stream: VoiceStream) {
    if (stream.graceTimer) clearTimeout(stream.graceTimer);
    if (stream.ackTimer) clearTimeout(stream.ackTimer);
    stream.sink?.close();
    this.streams.delete(stream.id);
  }

  /** Closes every socket and forgets every stream, on shutdown. */
  closeAll() {
    for (const stream of this.streams.values()) {
      stream.socket?.close(1001, 'server shutting down');
      this.dispose(stream);
    }
  }
}
