import { decodeAudioFrame, VOICE_CLOSE, VOICE_PROTOCOL } from '@dental/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRefused, VoiceSocket, type SocketLike, type VoiceEvent } from './voice-socket';

/** An in-memory server that keeps streams like the real one: numbered, deduplicated, acked. */
class FakeServer {
  streams = new Map<string, { nextSeq: number; frames: number[]; events: string[] }>();
  sockets: FakeSocket[] = [];
  tickets = 0;
  created = 0;
  /** When false, messages vanish: the connection is dead but nobody has noticed. */
  delivering = true;
  /** Forget streams, as after the grace period. */
  forget() {
    this.streams.clear();
  }
  get last() {
    return this.sockets.at(-1)!;
  }
}

class FakeSocket implements SocketLike {
  readyState = 0;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  streamId: string | null = null;
  closedWith: number | null = null;

  constructor(
    private readonly server: FakeServer,
    readonly protocols: string[]
  ) {
    server.sockets.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  private reply(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  send(data: string | Uint8Array) {
    if (!this.server.delivering || this.readyState !== 1) return;
    if (typeof data === 'string') {
      const message = JSON.parse(data) as Record<string, unknown>;
      if (message.type === 'hello') {
        const wanted = message.streamId as string | undefined;
        const resumed = wanted !== undefined && this.server.streams.has(wanted);
        const id = resumed ? wanted! : `s${++this.server.created}`;
        if (!resumed) this.server.streams.set(id, { nextSeq: 0, frames: [], events: [] });
        this.streamId = id;
        this.reply({
          type: 'ready',
          streamId: id,
          resumed,
          nextSeq: this.server.streams.get(id)!.nextSeq,
          expiresAt: '',
        });
        return;
      }
      this.apply(message.seq as number, () =>
        this.stream.events.push(`${String(message.type)}:${String(message.utteranceId)}`)
      );
      return;
    }
    const frame = decodeAudioFrame(data)!;
    this.apply(frame.seq, () => this.stream.frames.push(frame.samples[0]!));
  }

  private get stream() {
    return this.server.streams.get(this.streamId!)!;
  }

  private apply(seq: number, effect: () => void) {
    if (seq === this.stream.nextSeq) {
      effect();
      this.stream.nextSeq += 1;
    } else if (seq > this.stream.nextSeq) {
      throw new Error(`gap: got ${seq}, expected ${this.stream.nextSeq}`);
    }
    this.reply({ type: 'ack', seq: this.stream.nextSeq - 1 });
  }

  close(code = 1000) {
    this.closedWith = code;
    this.readyState = 3;
  }

  /** The network drops the connection. */
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

let server: FakeServer;
let events: VoiceEvent[];
let states: string[];

function client(overrides: Partial<ConstructorParameters<typeof VoiceSocket>[0]> = {}) {
  let id = 0;
  return new VoiceSocket({
    url: 'ws://test/v1/voice/stream',
    getTicket: async () => `t${++server.tickets}`,
    createSocket: (_url, protocols) => new FakeSocket(server, protocols),
    onEvent: (event) => events.push(event),
    onState: (state) => states.push(state),
    random: () => 0.5,
    newId: () => `u${++id}`,
    ...overrides,
  });
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const samples = (value: number) => new Int16Array(320).fill(value);

beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeServer();
  events = [];
  states = [];
});
afterEach(() => vi.useRealTimers());

describe('VoiceSocket', () => {
  it('opens with our protocol and a fresh ticket, and streams an utterance', async () => {
    const voice = client();
    voice.connect();
    await settle();
    expect(server.last.protocols).toEqual([VOICE_PROTOCOL, 'ticket.t1']);
    expect(voice.state).toBe('open');
    voice.startUtterance();
    for (let i = 1; i <= 5; i += 1) voice.audio(samples(i));
    voice.endUtterance();
    expect(server.streams.get('s1')).toEqual({
      nextSeq: 7,
      frames: [1, 2, 3, 4, 5],
      events: ['utterance.start:u1', 'utterance.end:u1'],
    });
    expect(voice.pending).toBe(0);
  });

  it('keeps speech through a blip and resumes the same stream without loss or repeats', async () => {
    const voice = client();
    voice.connect();
    await settle();
    voice.startUtterance();
    for (let i = 1; i <= 5; i += 1) voice.audio(samples(i));
    // The connection dies silently, then drops; the clinician keeps talking meanwhile.
    server.delivering = false;
    voice.audio(samples(6));
    voice.audio(samples(7));
    server.last.drop();
    expect(voice.state).toBe('reconnecting');
    server.delivering = true;
    voice.audio(samples(8));
    voice.endUtterance();
    expect(voice.pending).toBe(4);

    await vi.advanceTimersByTimeAsync(300);
    expect(voice.state).toBe('open');
    expect(server.sockets).toHaveLength(2);
    expect(server.last.protocols[1]).toBe('ticket.t2');
    expect(server.streams.size).toBe(1);
    expect(server.streams.get('s1')!.frames).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(server.streams.get('s1')!.events).toEqual(['utterance.start:u1', 'utterance.end:u1']);
    expect(voice.pending).toBe(0);
  });

  it('takes a connection with no acknowledgement as dead, and reconnects', async () => {
    const voice = client({ ackTimeoutMs: 1_000 });
    voice.connect();
    await settle();
    voice.startUtterance();
    server.delivering = false;
    voice.audio(samples(1));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(server.sockets[0]!.closedWith).toBe(4999);
    server.delivering = true;
    await vi.advanceTimersByTimeAsync(300);
    expect(voice.state).toBe('open');
    expect(server.streams.get('s1')!.frames).toEqual([1]);
  });

  it('waits while offline, keeping speech, and sends it once back online', async () => {
    const voice = client();
    voice.connect();
    await settle();
    voice.setOnline(false);
    expect(voice.state).toBe('offline');
    voice.startUtterance();
    voice.audio(samples(1));
    voice.endUtterance();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.sockets).toHaveLength(1);
    voice.setOnline(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(voice.state).toBe('open');
    expect(server.streams.get('s1')!.frames).toEqual([1]);
  });

  it('reports an utterance lost when the server no longer has the stream', async () => {
    const voice = client();
    voice.connect();
    await settle();
    voice.startUtterance();
    voice.audio(samples(1));
    server.delivering = false;
    voice.audio(samples(2));
    server.last.drop();
    server.delivering = true;
    server.forget();
    await vi.advanceTimersByTimeAsync(300);
    expect(events).toContainEqual({ type: 'utterance.lost', utteranceId: 'u1' });
    expect(voice.speaking).toBe(false);
    voice.audio(samples(3));
    expect(voice.pending).toBe(0);
    voice.startUtterance();
    voice.audio(samples(4));
    expect(server.streams.get('s2')!.frames).toEqual([4]);
  });

  it('backs off between failed attempts and fetches a ticket each time', async () => {
    let failures = 2;
    const voice = client({
      getTicket: async () => {
        if (failures-- > 0) throw new Error('network');
        return 'ok';
      },
    });
    voice.connect();
    await settle();
    expect(voice.state).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(249);
    expect(server.sockets).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1 + 500);
    expect(voice.state).toBe('open');
  });

  it('reconnects at once when the access behind the ticket expires', async () => {
    const voice = client();
    voice.connect();
    await settle();
    server.last.drop(VOICE_CLOSE.expired);
    await settle();
    expect(server.sockets).toHaveLength(2);
    expect(voice.state).toBe('open');
    expect(server.streams.size).toBe(1);
  });

  it('goes quiet when idle or taken over by another tab, and wakes on the next utterance', async () => {
    const voice = client();
    voice.connect();
    await settle();
    server.last.drop(VOICE_CLOSE.replaced);
    expect(voice.state).toBe('idle');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.sockets).toHaveLength(1);
    voice.startUtterance();
    voice.audio(samples(9));
    await settle();
    expect(voice.state).toBe('open');
    expect(server.streams.get('s2')!.frames).toEqual([9]);
  });

  it('stops for a user who may not use voice', async () => {
    const voice = client({
      getTicket: async () => {
        throw new VoiceRefused();
      },
    });
    voice.connect();
    await settle();
    expect(voice.state).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.sockets).toHaveLength(0);
  });

  it('bounds what waits for an ack, and counts what it had to drop', async () => {
    const voice = client({ maxBuffered: 3 });
    voice.setOnline(false);
    voice.startUtterance();
    for (let i = 1; i <= 5; i += 1) voice.audio(samples(i));
    expect(voice.pending).toBe(3);
    expect(voice.dropped).toBe(3);
  });

  it('never opens two sockets for overlapping connects', async () => {
    const voice = client();
    voice.connect();
    voice.connect();
    voice.startUtterance();
    await settle();
    expect(server.sockets).toHaveLength(1);
  });
});
