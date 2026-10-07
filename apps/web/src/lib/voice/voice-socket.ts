import {
  encodeAudioFrame,
  VOICE_CLOSE,
  VOICE_PROTOCOL,
  VOICE_TICKET_PREFIX,
  type VoiceServerMessage,
} from '@dental/contracts';

/**
 * The browser end of the voice stream (V1). It keeps everything the server has not
 * acknowledged, and after a drop reconnects with a fresh ticket, resumes the stream and resends
 * from where the server stopped, so a network blip loses no speech. See
 * packages/contracts/src/voice.ts for the protocol.
 */

export type VoiceConnection =
  /** Not connected and not trying: never started, closed when idle, or taken by another tab. */
  | 'idle'
  | 'connecting'
  | 'open'
  /** Lost the connection; trying again. */
  | 'reconnecting'
  /** The browser is offline; speech is kept and sent when it is back. */
  | 'offline'
  /** This user may not use voice. */
  | 'unavailable';

export type VoiceEvent =
  | VoiceServerMessage
  /** The server no longer had the stream, so an utterance in flight could not be completed. */
  | { type: 'utterance.lost'; utteranceId: string };

/** Minimal WebSocket surface, so tests can supply their own. */
export interface SocketLike {
  readonly readyState: number;
  binaryType: string;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

/** Thrown by getTicket when the user may not use voice; the client stops trying. */
export class VoiceRefused extends Error {}

export interface VoiceSocketOptions {
  url: string;
  getTicket(): Promise<string>;
  createSocket?(url: string, protocols: string[]): SocketLike;
  onState?(state: VoiceConnection): void;
  onEvent?(event: VoiceEvent): void;
  /** Reconnect delays, each scaled by a random 0.5 to 1.5. */
  backoffMs?: number[];
  /** With unacknowledged data and no ack for this long, the connection is taken as dead. */
  ackTimeoutMs?: number;
  /** At most this many items wait for an ack (1,500 frames is 30 s of speech). */
  maxBuffered?: number;
  random?(): number;
  newId?(): string;
}

const OPEN = 1;

interface Outgoing {
  seq: number;
  data: string | Uint8Array;
}

export class VoiceSocket {
  private socket: SocketLike | null = null;
  private streamId: string | null = null;
  private nextSeq = 0;
  private outbox: Outgoing[] = [];
  private utterance: string | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Fetching a ticket; the socket does not exist yet. */
  private opening = false;
  private online = true;
  private current: VoiceConnection = 'idle';
  /** Frames dropped because too much was waiting; shown so nobody assumes they were heard. */
  dropped = 0;

  constructor(private readonly options: VoiceSocketOptions) {}

  get state() {
    return this.current;
  }

  /** Items sent but not yet acknowledged. */
  get pending() {
    return this.outbox.length;
  }

  get speaking() {
    return this.utterance !== null;
  }

  connect() {
    this.stopped = false;
    if (this.socket || this.opening || this.reconnectTimer || this.current === 'unavailable') {
      return;
    }
    if (!this.online) {
      this.setState('offline');
      return;
    }
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    void this.open();
  }

  startUtterance(): string {
    if (this.current === 'idle') this.connect();
    if (this.utterance) this.endUtterance();
    const id = this.options.newId?.() ?? crypto.randomUUID();
    this.utterance = id;
    this.dropped = 0;
    this.enqueue({ type: 'utterance.start', utteranceId: id });
    return id;
  }

  audio(samples: Int16Array) {
    if (!this.utterance) return;
    if (this.outbox.length >= (this.options.maxBuffered ?? 1_500)) {
      this.dropped += 1;
      return;
    }
    const seq = this.nextSeq++;
    this.push({ seq, data: encodeAudioFrame(seq, samples) });
  }

  endUtterance() {
    if (!this.utterance) return;
    this.enqueue({ type: 'utterance.end', utteranceId: this.utterance });
    this.utterance = null;
  }

  /** From the browser's online and offline events. */
  setOnline(online: boolean) {
    this.online = online;
    if (this.stopped) return;
    if (!online) {
      this.abandon();
      this.clearReconnect();
      this.setState('offline');
    } else if (this.current === 'offline') {
      this.attempt = Math.max(this.attempt, 1);
      this.connect();
    }
  }

  stop() {
    this.stopped = true;
    this.clearReconnect();
    this.clearAckTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      this.detach(socket);
      socket.close(1000, 'done');
    }
    this.setState('idle');
  }

  private async open() {
    let ticket: string;
    this.opening = true;
    try {
      ticket = await this.options.getTicket();
    } catch (error) {
      this.opening = false;
      if (error instanceof VoiceRefused) {
        this.setState('unavailable');
        return;
      }
      this.scheduleReconnect();
      return;
    }
    this.opening = false;
    if (this.stopped || !this.online) return;
    const create =
      this.options.createSocket ??
      ((url: string, protocols: string[]) =>
        new WebSocket(url, protocols) as unknown as SocketLike);
    const socket = create(this.options.url, [VOICE_PROTOCOL, `${VOICE_TICKET_PREFIX}${ticket}`]);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.onopen = () => {
      socket.send(
        JSON.stringify({ type: 'hello', ...(this.streamId ? { streamId: this.streamId } : {}) })
      );
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      this.receive(JSON.parse(event.data) as VoiceServerMessage);
    };
    socket.onerror = () => undefined;
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.closed(event.code);
    };
  }

  private receive(message: VoiceServerMessage) {
    if (message.type === 'ready') {
      if (message.resumed) {
        this.outbox = this.outbox.filter((item) => item.seq >= message.nextSeq);
      } else if (this.streamId) {
        // The server no longer had our stream: what was in flight is gone; start again at 0.
        if (this.utterance) {
          this.options.onEvent?.({ type: 'utterance.lost', utteranceId: this.utterance });
          this.utterance = null;
        }
        this.outbox = [];
        this.nextSeq = 0;
      }
      // A first connection keeps what was queued before it: it is already numbered from 0.
      this.streamId = message.streamId;
      this.attempt = 0;
      this.setState('open');
      for (const item of this.outbox) this.socket?.send(item.data);
      if (this.outbox.length) this.armAckTimer();
      return;
    }
    if (message.type === 'ack') {
      this.outbox = this.outbox.filter((item) => item.seq > message.seq);
      this.clearAckTimer();
      if (this.outbox.length) this.armAckTimer();
      return;
    }
    this.options.onEvent?.(message);
  }

  private closed(code: number) {
    this.clearAckTimer();
    if (this.stopped) return;
    if (code === VOICE_CLOSE.idle || code === VOICE_CLOSE.replaced) {
      // Idle: the stream is gone. Replaced: another tab took it. Either way, wait for use.
      this.streamId = null;
      this.outbox = [];
      this.nextSeq = 0;
      this.setState('idle');
      return;
    }
    if (code === VOICE_CLOSE.protocol || code === VOICE_CLOSE.refused) {
      this.streamId = null;
      if (this.utterance) {
        this.options.onEvent?.({ type: 'utterance.lost', utteranceId: this.utterance });
        this.utterance = null;
      }
      this.outbox = [];
      this.nextSeq = 0;
    }
    if (code === VOICE_CLOSE.expired) this.attempt = 0;
    this.scheduleReconnect(code === VOICE_CLOSE.expired ? 0 : undefined);
  }

  private scheduleReconnect(delay?: number) {
    if (this.stopped) return;
    if (!this.online) {
      this.setState('offline');
      return;
    }
    const backoff = this.options.backoffMs ?? [250, 500, 1_000, 2_000, 4_000];
    const base = backoff[Math.min(this.attempt, backoff.length - 1)]!;
    const wait = delay ?? base * (0.5 + (this.options.random?.() ?? Math.random()));
    this.attempt += 1;
    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, wait);
  }

  private enqueue(message: { type: 'utterance.start' | 'utterance.end'; utteranceId: string }) {
    const seq = this.nextSeq++;
    this.push({ seq, data: JSON.stringify({ ...message, seq }) });
  }

  private push(item: Outgoing) {
    this.outbox.push(item);
    if (this.current === 'open' && this.socket?.readyState === OPEN) {
      this.socket.send(item.data);
      if (!this.ackTimer) this.armAckTimer();
    }
  }

  private armAckTimer() {
    this.clearAckTimer();
    this.ackTimer = setTimeout(() => {
      this.ackTimer = null;
      // No acknowledgement: the connection is dead even if the browser has not noticed.
      if (this.outbox.length && this.socket) {
        this.abandon();
        this.scheduleReconnect();
      }
    }, this.options.ackTimeoutMs ?? 3_000);
  }

  private clearAckTimer() {
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /** Drops the current socket without waiting for it to close. */
  private abandon() {
    const socket = this.socket;
    this.socket = null;
    this.clearAckTimer();
    if (!socket) return;
    this.detach(socket);
    try {
      socket.close(4999, 'abandoned');
    } catch {
      // Closing a dead socket may throw; it is gone either way.
    }
  }

  private detach(socket: SocketLike) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
  }

  private setState(state: VoiceConnection) {
    if (state === this.current) return;
    this.current = state;
    this.options.onState?.(state);
  }
}
