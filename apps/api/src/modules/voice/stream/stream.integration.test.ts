import { randomUUID } from 'node:crypto';
import {
  encodeAudioFrame,
  VOICE_CLOSE,
  VOICE_FRAME_SAMPLES,
  VOICE_PROTOCOL,
  VOICE_TICKET_PREFIX,
  type SystemRole,
  type VoiceServerMessage,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { SecretBox } from '../../../platform/secret-box.js';
import { buildServer } from '../../../server.js';
import {
  accessToken,
  createClinic,
  createMember,
  startTestDatabase,
  type TestDatabase,
} from '../../../testing/database.js';
import { createDummyHash } from '../../identity/passwords.js';
import { IdentityService } from '../../identity/service.js';
import {
  ChallengeTokens,
  loadSigningKeys,
  TokenService,
  type SigningKeys,
} from '../../identity/tokens.js';
import type { StreamSink } from './streams.js';

/** V1 acceptance: the stream survives a network blip; an unauthenticated socket is refused. */

const ORIGIN = 'http://localhost:3000';
let db: TestDatabase;
let app: FastifyInstance;
let keys: SigningKeys;
let tokens: TokenService;
let url = '';
const alpha: Record<string, string> = {};
const beta: Record<string, string> = {};
/** What the speech sink received, per utterance. */
const heard = new Map<string, number[]>();

async function token(role: SystemRole, clinic = alpha, ttl?: number) {
  const signer = ttl ? new TokenService(keys, ttl) : tokens;
  return accessToken(signer, { userId: clinic[role]!, clinicId: clinic.clinic!, role });
}

async function ticket(role: SystemRole = 'assistant', clinic = alpha, ttl?: number) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/voice/tickets',
    headers: { authorization: `Bearer ${await token(role, clinic, ttl)}` },
  });
  return response.json().ticket as string;
}

/** A client: the socket, everything it received, and a way to wait for a message. */
interface Client {
  socket: WebSocket;
  messages: VoiceServerMessage[];
  next<T extends VoiceServerMessage['type']>(
    type: T,
    match?: (message: Extract<VoiceServerMessage, { type: T }>) => boolean
  ): Promise<Extract<VoiceServerMessage, { type: T }>>;
  closed: Promise<{ code: number; reason: string }>;
}

function connect(
  options: { ticket?: string; origin?: string; protocols?: string[] } = {}
): Promise<Client | { status: number }> {
  const protocols =
    options.protocols ??
    (options.ticket ? [VOICE_PROTOCOL, `${VOICE_TICKET_PREFIX}${options.ticket}`] : []);
  const socket = new WebSocket(url, protocols, { origin: options.origin ?? ORIGIN });
  return new Promise((resolve, reject) => {
    socket.once('unexpected-response', (_request, response) =>
      resolve({ status: response.statusCode ?? 0 })
    );
    socket.once('error', reject);
    socket.once('open', () => {
      const messages: VoiceServerMessage[] = [];
      const waiters: (() => void)[] = [];
      socket.on('message', (data) => {
        messages.push(JSON.parse(data.toString()) as VoiceServerMessage);
        for (const wake of waiters.splice(0)) wake();
      });
      const closed = new Promise<{ code: number; reason: string }>((done) =>
        socket.once('close', (code, reason) => done({ code, reason: reason.toString() }))
      );
      resolve({
        socket,
        messages,
        closed,
        next: (type, match) =>
          new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`no ${type} message`)), 5_000);
            const look = () => {
              const found = messages.find((m) => m.type === type && (!match || match(m as never)));
              if (found) {
                clearTimeout(timer);
                done(found as never);
              } else waiters.push(look);
            };
            look();
          }),
      });
    });
  });
}

async function open(role: SystemRole = 'assistant', clinic = alpha) {
  const client = await connect({ ticket: await ticket(role, clinic) });
  if (!('socket' in client)) throw new Error(`refused with ${client.status}`);
  return client;
}

const frame = (seq: number, value = seq) =>
  encodeAudioFrame(seq, new Int16Array(VOICE_FRAME_SAMPLES).fill(value));
const control = (type: 'utterance.start' | 'utterance.end', seq: number, utteranceId: string) =>
  JSON.stringify({ type, seq, utteranceId });

beforeAll(async () => {
  db = await startTestDatabase();
  for (const [record, name] of [
    [alpha, 'Alpha Dental'],
    [beta, 'Beta Dental'],
  ] as const) {
    record.clinic = await createClinic(db.owner, name);
    for (const role of ['dentist', 'assistant', 'receptionist'] as const) {
      record[role] = await createMember(db.owner, record.clinic, role);
    }
  }
  keys = loadSigningKeys();
  tokens = new TokenService(keys, 600);
  app = await buildServer({
    corsOrigin: ORIGIN,
    identity: {
      pool: db.pool,
      tokens,
      service: new IdentityService({
        pool: db.pool,
        tokens,
        challenges: new ChallengeTokens(keys),
        secrets: SecretBox.development(),
        dummyHash: await createDummyHash(),
      }),
      cookie: { secure: false, sameSite: 'lax' },
      dataBox: SecretBox.development(),
    },
    voiceStream: {
      timings: { graceMs: 600, idleMs: 3_500, pingMs: 100, helloMs: 400, ackDelayMs: 30 },
      // Stands in for speech-to-text: records the audio, and "transcribes" an utterance a
      // little after it ends, as a provider would.
      createSink: (_owner, emit): StreamSink => {
        let current: number[] = [];
        return {
          utteranceStart: (id) => heard.set(id, (current = [])),
          audio: (samples) => current.push(samples[0]!),
          utteranceEnd: (id) => {
            const frames = heard.get(id)!.length;
            setTimeout(
              () =>
                emit({
                  type: 'transcript.final',
                  utteranceId: id,
                  text: `${frames} frames`,
                  confidence: 1,
                  finalizeMs: 150,
                }),
              150
            );
          },
          close: () => undefined,
        };
      },
    },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  url = `ws://127.0.0.1:${address.port}/v1/voice/stream`;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('POST /v1/voice/tickets', () => {
  it('gives clinicians a short single-use ticket, and nobody else', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/voice/tickets',
      headers: { authorization: `Bearer ${await token('dentist')}` },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { ticket: issued, expiresAt } = response.json();
    expect(issued.startsWith(`${alpha.clinic}.`)).toBe(true);
    const seconds = (new Date(expiresAt).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(25);
    expect(seconds).toBeLessThanOrEqual(30);

    const stored = await db.owner.query(`SELECT token_hash FROM voice.stream_tickets`);
    expect(stored.rows.some((row) => row.token_hash === issued)).toBe(false);

    const receptionist = await app.inject({
      method: 'POST',
      url: '/v1/voice/tickets',
      headers: { authorization: `Bearer ${await token('receptionist')}` },
    });
    expect(receptionist.statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/voice/tickets' })).statusCode).toBe(401);
  });
});

describe('opening the stream', () => {
  it('is refused before the upgrade without a valid ticket', async () => {
    expect(await connect()).toEqual({ status: 401 });
    expect(await connect({ protocols: [VOICE_PROTOCOL] })).toEqual({ status: 401 });
    expect(await connect({ ticket: `${alpha.clinic}.made-up` })).toEqual({ status: 401 });
    expect(await connect({ ticket: 'not-a-ticket' })).toEqual({ status: 401 });
    // A real ticket offered without our protocol.
    expect(await connect({ protocols: [`${VOICE_TICKET_PREFIX}${await ticket()}`] })).toEqual({
      status: 401,
    });
  });

  it('is refused for a used, an expired or a moved ticket, and from another site', async () => {
    const once = await ticket();
    const first = await connect({ ticket: once });
    expect('socket' in first).toBe(true);
    expect(await connect({ ticket: once })).toEqual({ status: 401 });

    const expiredSecret = `${alpha.clinic}.expired-${randomUUID()}`;
    await db.owner.query(
      `INSERT INTO voice.stream_tickets
         (id, clinic_id, user_id, token_hash, role, access_expires_at, expires_at, created_at)
       VALUES ($1, $2, $3, encode(sha256($4::bytea), 'hex'), 'assistant',
               now() + interval '5 minutes', now() - interval '1 second', now() - interval '31 seconds')`,
      [uuidv7(), alpha.clinic, alpha.assistant, expiredSecret]
    );
    expect(await connect({ ticket: expiredSecret })).toEqual({ status: 401 });

    // A ticket is found under the clinic it names; naming another clinic finds nothing.
    const [, secret] = (await ticket()).split('.');
    expect(await connect({ ticket: `${beta.clinic}.${secret}` })).toEqual({ status: 401 });

    expect(await connect({ ticket: await ticket(), origin: 'https://evil.example' })).toEqual({
      status: 403,
    });
    if ('socket' in first) first.socket.close();
  });

  it('agrees on our protocol and never echoes the ticket', async () => {
    const client = await open();
    expect(client.socket.protocol).toBe(VOICE_PROTOCOL);
    client.socket.send(JSON.stringify({ type: 'hello' }));
    const ready = await client.next('ready');
    expect(ready).toMatchObject({
      resumed: false,
      nextSeq: 0,
      streamId: expect.any(String),
      speech: true,
    });
    client.socket.close();
  });
});

describe('streaming', () => {
  it('acknowledges audio and reports each utterance', async () => {
    const client = await open();
    client.socket.send(JSON.stringify({ type: 'hello' }));
    await client.next('ready');
    client.socket.send(control('utterance.start', 0, 'u1'));
    await client.next('utterance.started');
    for (let seq = 1; seq <= 50; seq += 1) client.socket.send(frame(seq));
    client.socket.send(control('utterance.end', 51, 'u1'));
    const ended = await client.next('utterance.ended');
    expect(ended).toEqual({
      type: 'utterance.ended',
      utteranceId: 'u1',
      frames: 50,
      durationMs: 1000,
    });
    expect(await client.next('ack', (m) => m.seq === 51)).toBeTruthy();
    client.socket.close();
  });

  it('survives a network blip: resumes on a new socket without losing or repeating audio', async () => {
    const sent: (string | Uint8Array)[] = [];
    const send = (client: Client, seq: number) => client.socket.send(sent[seq]!);
    sent[0] = control('utterance.start', 0, 'blip');
    for (let seq = 1; seq <= 40; seq += 1) sent[seq] = frame(seq);
    sent[41] = control('utterance.end', 41, 'blip');

    const first = await open();
    first.socket.send(JSON.stringify({ type: 'hello' }));
    const { streamId } = await first.next('ready');
    for (let seq = 0; seq <= 25; seq += 1) send(first, seq);
    await first.next('ack', (m) => m.seq >= 10);
    // The connection drops with no closing handshake; some frames may never have arrived.
    first.socket.terminate();

    const second = await open();
    second.socket.send(JSON.stringify({ type: 'hello', streamId }));
    const ready = await second.next('ready');
    expect(ready).toMatchObject({ streamId, resumed: true });
    expect(ready.nextSeq).toBeGreaterThanOrEqual(11);
    expect(ready.nextSeq).toBeLessThanOrEqual(26);
    // The client resends what was not acknowledged, overlapping on purpose.
    for (let seq = Math.max(0, ready.nextSeq - 3); seq <= 41; seq += 1) send(second, seq);
    const ended = await second.next('utterance.ended');
    expect(ended).toMatchObject({ utteranceId: 'blip', frames: 40, durationMs: 800 });
    expect(heard.get('blip')).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    second.socket.close();
  });

  it('delivers a transcript that was ready while the socket was down, once resumed', async () => {
    const first = await open();
    first.socket.send(JSON.stringify({ type: 'hello' }));
    const { streamId } = await first.next('ready');
    first.socket.send(control('utterance.start', 0, 'late-result'));
    for (let seq = 1; seq <= 5; seq += 1) first.socket.send(frame(seq));
    first.socket.send(control('utterance.end', 6, 'late-result'));
    await first.next('ack', (m) => m.seq === 6);
    // Gone before the transcript is ready.
    first.socket.terminate();
    await new Promise((done) => setTimeout(done, 250));

    const second = await open();
    second.socket.send(JSON.stringify({ type: 'hello', streamId }));
    await second.next('ready');
    expect(
      await second.next('transcript.final', (m) => m.utteranceId === 'late-result')
    ).toMatchObject({ text: '5 frames' });
    second.socket.close();
  });

  it('moves a stream resumed elsewhere off the old socket', async () => {
    const first = await open();
    first.socket.send(JSON.stringify({ type: 'hello' }));
    const { streamId } = await first.next('ready');
    const second = await open();
    second.socket.send(JSON.stringify({ type: 'hello', streamId }));
    await second.next('ready');
    expect((await first.closed).code).toBe(VOICE_CLOSE.replaced);
    second.socket.close();
  });

  it('cannot be resumed by someone else', async () => {
    const mine = await open('assistant');
    mine.socket.send(JSON.stringify({ type: 'hello' }));
    const { streamId } = await mine.next('ready');
    for (const [role, clinic] of [
      ['dentist', alpha],
      ['assistant', beta],
    ] as const) {
      const other = await open(role, clinic);
      other.socket.send(JSON.stringify({ type: 'hello', streamId }));
      expect((await other.closed).code).toBe(VOICE_CLOSE.refused);
    }
    mine.socket.close();
  });

  it('starts afresh once the grace period has passed', async () => {
    const first = await open();
    first.socket.send(JSON.stringify({ type: 'hello' }));
    const { streamId } = await first.next('ready');
    first.socket.send(control('utterance.start', 0, 'late'));
    await first.next('ack', (m) => m.seq === 0);
    first.socket.terminate();
    await new Promise((done) => setTimeout(done, 900));
    const second = await open();
    second.socket.send(JSON.stringify({ type: 'hello', streamId }));
    const ready = await second.next('ready');
    expect(ready.resumed).toBe(false);
    expect(ready.nextSeq).toBe(0);
    expect(ready.streamId).not.toBe(streamId);
    second.socket.close();
  });
});

describe('closing', () => {
  it('closes on a protocol error: no hello, a gap, or a broken frame', async () => {
    const silent = await open();
    expect((await silent.closed).code).toBe(VOICE_CLOSE.protocol);

    const gap = await open();
    gap.socket.send(JSON.stringify({ type: 'hello' }));
    await gap.next('ready');
    gap.socket.send(frame(5));
    expect(await gap.closed).toEqual({ code: VOICE_CLOSE.protocol, reason: 'expected 0' });

    const broken = await open();
    broken.socket.send(JSON.stringify({ type: 'hello' }));
    await broken.next('ready');
    broken.socket.send(new Uint8Array([1, 0, 0, 0, 0, 7]));
    expect((await broken.closed).code).toBe(VOICE_CLOSE.protocol);
  });

  it('closes when the access token behind the ticket expires, and resumes on a new one', async () => {
    const short = await connect({ ticket: await ticket('assistant', alpha, 2) });
    if (!('socket' in short)) throw new Error('refused');
    short.socket.send(JSON.stringify({ type: 'hello' }));
    const { streamId } = await short.next('ready');
    expect((await short.closed).code).toBe(VOICE_CLOSE.expired);
    const renewed = await open();
    renewed.socket.send(JSON.stringify({ type: 'hello', streamId }));
    expect((await renewed.next('ready')).resumed).toBe(true);
    renewed.socket.close();
  });

  it('closes an idle stream for good', { timeout: 10_000 }, async () => {
    const idle = await open();
    idle.socket.send(JSON.stringify({ type: 'hello' }));
    const { streamId } = await idle.next('ready');
    expect((await idle.closed).code).toBe(VOICE_CLOSE.idle);
    const again = await open();
    again.socket.send(JSON.stringify({ type: 'hello', streamId }));
    expect((await again.next('ready')).resumed).toBe(false);
    again.socket.close();
  });
});
