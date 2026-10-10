import { randomUUID } from 'node:crypto';
import type { SystemRole } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { ChallengeTokens, loadSigningKeys, TokenService } from '../../identity/tokens.js';
import { InterpreterRegistry } from '../interpreters.js';
import type { Interpreter, ModelReply, ToolCallRequest } from '../types.js';
import { PROMPT_VERSION } from './prompt.js';

/** V4 acceptance: model output outside the registry is rejected. */

/** A model that answers from a script and records what it was asked. */
class ScriptedModel implements Interpreter {
  readonly provider = 'scripted';
  readonly model = 'script-1';
  readonly promptVersion = 0;
  next: ModelReply | Error = { kind: 'text' };
  requests: ToolCallRequest[] = [];
  /** Runs while the model is "thinking", to change the world meanwhile. */
  during: (() => Promise<void>) | null = null;

  async call(request: ToolCallRequest): Promise<ModelReply> {
    this.requests.push(request);
    await this.during?.();
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }

  async interpret(): Promise<never> {
    throw new Error('not used');
  }
}

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const model = new ScriptedModel();
const alpha: Record<string, string> = {};
let sara = '';
let omid = '';
let saraSession = '';

async function headers(role: SystemRole) {
  const token = await accessToken(tokens, { userId: alpha[role]!, clinicId: alpha.clinic!, role });
  return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
}

const interpret = async (text: string, role: SystemRole = 'dentist') =>
  app.inject({
    method: 'POST',
    url: '/v1/voice/interpret',
    payload: { text },
    headers: await headers(role),
  });
const focus = async (body: Record<string, unknown>, role: SystemRole = 'dentist') =>
  app.inject({
    method: 'PUT',
    url: '/v1/voice/context/focus',
    payload: body,
    headers: await headers(role),
  });
const context = async (role: SystemRole = 'dentist') =>
  (
    await app.inject({ method: 'GET', url: '/v1/voice/context', headers: await headers(role) })
  ).json();
const tool = (name: string, input: unknown): ModelReply => ({ kind: 'tool', name, input });

beforeAll(async () => {
  db = await startTestDatabase();
  alpha.clinic = await createClinic(db.owner, 'Alpha Dental');
  for (const role of ['dentist', 'assistant', 'receptionist'] as const) {
    alpha[role] = await createMember(db.owner, alpha.clinic, role);
  }
  const keys = loadSigningKeys();
  tokens = new TokenService(keys, 600);
  app = await buildServer({
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
    interpreters: new InterpreterRegistry({ anthropic: model }, 'anthropic'),
  });
  const register = async (givenName: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/v1/patients',
        payload: { givenName, familyName: 'Voice', birthDate: '1980-02-02', sex: 'female' },
        headers: await headers('receptionist'),
      })
    ).json().id as string;
  sara = await register('Sara');
  omid = await register('Omid');
  saraSession = (
    await app.inject({
      method: 'POST',
      url: '/v1/sessions',
      payload: { patientId: sara },
      headers: await headers('dentist'),
    })
  ).json().id;
}, 180_000);

beforeEach(() => {
  model.next = { kind: 'text' };
  model.requests = [];
  model.during = null;
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('POST /v1/voice/interpret', () => {
  it('turns an utterance into an intent, records it, and holds it as the pending proposal', async () => {
    await focus({ patientId: sara, sessionId: saraSession, tooth: '16' });
    model.next = tool('procedure__start', { procedure: 'root canal', confidence: 0.94 });
    const response = await interpret('start the root canal');
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result).toMatchObject({
      outcome: 'intent',
      command: 'procedure.start',
      entities: { procedure: 'root canal' },
      missing: [],
      confidence: 0.94,
      provider: 'scripted',
      model: 'script-1',
      promptVersion: PROMPT_VERSION,
      proposed: true,
    });
    // Resolved (V5): the catalog procedure for a molar, on the tooth in focus.
    expect((await context()).pending).toMatchObject({
      id: result.id,
      type: 'procedure.start',
      payload: { sessionId: saraSession, procedureCode: 'root_canal_molar', tooth: '16' },
    });

    // What the model was told: the situation without names or ids, and the offered tools.
    const request = model.requests[0]!;
    expect(request.user).toContain('Session: open');
    expect(request.user).toContain('Tooth in focus: 16');
    expect(request.user).not.toContain(sara);
    expect(request.user).not.toContain('Sara');
    expect(request.tools.map((t) => t.name)).toContain('procedure__start');

    const stored = await db.owner.query(
      `SELECT u.source, u.transcript, i.outcome, i.command_type, i.prompt_version, i.prompt_fingerprint,
              i.context_snapshot
       FROM voice.interpretations AS i JOIN voice.utterances AS u ON u.id = i.utterance_id
       WHERE i.id = $1`,
      [result.id]
    );
    expect(stored.rows[0]).toMatchObject({
      source: 'text',
      transcript: 'start the root canal',
      outcome: 'intent',
      command_type: 'procedure.start',
      prompt_version: PROMPT_VERSION,
      prompt_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(stored.rows[0].context_snapshot).toMatchObject({ toothInFocus: '16', session: 'open' });
  });

  it('drops what was not said, even a tooth in focus, and asks for it instead', async () => {
    // Tooth 16 is in focus; the model fills it in although "caries" names no tooth.
    model.next = tool('finding__add', { tooth: '16', finding: 'caries', confidence: 0.8 });
    const result = (await interpret('caries')).json();
    expect(result).toMatchObject({
      outcome: 'intent',
      entities: { finding: 'caries' },
      missing: ['tooth'],
      dropped: ['tooth'],
      proposed: true,
    });
    // The resolver then fills the tooth from context openly, labelled as such (V5), and asks
    // for the surfaces a caries finding needs.
    expect(result.proposal.fields).toContainEqual({
      key: 'tooth',
      value: '16',
      resolvedFrom: 'context',
    });
    expect((await context()).pending).toMatchObject({
      payload: { tooth: '16', code: 'caries' },
      missing: ['surfaces'],
    });
    const stored = await db.owner.query('SELECT dropped FROM voice.interpretations WHERE id = $1', [
      result.id,
    ]);
    expect(stored.rows[0].dropped).toEqual(['tooth']);
  });

  it('rejects output outside the registry, records it, and proposes nothing (V4 acceptance)', async () => {
    await app.voiceContext!.discard({ clinicId: alpha.clinic!, userId: alpha.dentist! });
    const outside: ModelReply[] = [
      tool('patient__delete', { confidence: 1 }),
      tool('clinic__update_settings', { confidence: 0.9 }),
      tool('procedure__start', { procedure: 'crown', confidence: 0.9, patientId: sara }),
      tool('procedure__start', { procedure: 42, confidence: 0.9 }),
      tool('procedure__start', { procedure: 'crown', confidence: 3 }),
      tool('procedure__start', undefined),
    ];
    for (const reply of outside) {
      model.next = reply;
      const result = (await interpret('do something')).json();
      expect(result).toMatchObject({ outcome: 'rejected', command: null, proposed: false });
      expect(result.reason).toBeTruthy();
    }
    expect((await context()).pending).toBeNull();
    const stored = await db.owner.query(
      `SELECT count(*)::int AS n FROM voice.interpretations WHERE outcome = 'rejected'`
    );
    expect(stored.rows[0].n).toBe(outside.length);
  });

  it('never offers, and rejects, what the clinician may not do', async () => {
    await focus({ patientId: sara, sessionId: saraSession }, 'assistant');
    model.next = tool('diagnosis__record', { diagnosis: 'pulpitis', confidence: 0.9 });
    const result = (await interpret('diagnosis pulpitis', 'assistant')).json();
    expect(result.outcome).toBe('rejected');
    const offered = model.requests[0]!.tools.map((t) => t.name);
    expect(offered).toContain('diagnosis__suggest');
    expect(offered).not.toContain('diagnosis__record');
  });

  it('records no command for conversation, and a failure when the provider does not answer', async () => {
    model.next = tool('no_command', { reason: 'small talk' });
    expect((await interpret('how was your weekend?')).json()).toMatchObject({
      outcome: 'none',
      reason: 'small talk',
      proposed: false,
    });
    model.next = new Error('provider down');
    expect((await interpret('add a crown')).json()).toMatchObject({
      outcome: 'failed',
      proposed: false,
    });
  });

  it('does not propose when the patient changed while the model was answering', async () => {
    await focus({ patientId: sara, sessionId: saraSession });
    model.next = tool('note__add', { body: 'Patient reports sensitivity', confidence: 0.9 });
    model.during = async () => {
      await focus({ patientId: omid });
    };
    const result = (await interpret('add a note patient reports sensitivity')).json();
    expect(result).toMatchObject({ outcome: 'intent', proposed: false });
    expect(await context()).toMatchObject({ patientId: omid, pending: null });
  });

  it('is for clinicians who use voice, with valid text', async () => {
    expect((await interpret('add a crown', 'receptionist')).statusCode).toBe(403);
    expect((await interpret('   ')).statusCode).toBe(400);
    expect((await interpret('x'.repeat(2_001))).statusCode).toBe(400);
    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/v1/voice/interpret',
      payload: { text: 'hi' },
    });
    expect(unauthenticated.statusCode).toBe(401);
  });
});
