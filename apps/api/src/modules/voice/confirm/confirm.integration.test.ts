import { randomUUID } from 'node:crypto';
import type { SystemRole, VoiceInterpretation } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import type { Interpreter, ModelReply } from '../types.js';

/** V6 acceptance: no R2 or R3 command executes without confirmation. */

class ScriptedModel implements Interpreter {
  readonly provider = 'scripted';
  readonly model = 'script-1';
  readonly promptVersion = 0;
  next: ModelReply = { kind: 'text' };
  async call(): Promise<ModelReply> {
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
let session = '';

async function headers(role: SystemRole = 'dentist') {
  const token = await accessToken(tokens, { userId: alpha[role]!, clinicId: alpha.clinic!, role });
  return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
}
const post = async (
  url: string,
  payload: Record<string, unknown> = {},
  role: SystemRole = 'dentist'
) => app.inject({ method: 'POST', url, payload, headers: await headers(role) });
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

/** An utterance the scripted model understands as the given tool call. */
async function say(
  text: string,
  tool: string,
  input: Record<string, unknown> = {},
  role: SystemRole = 'dentist'
): Promise<VoiceInterpretation> {
  model.next = { kind: 'tool', name: tool, input: { confidence: 0.95, ...input } };
  const response = await post('/v1/voice/interpret', { text }, role);
  expect(response.statusCode).toBe(200);
  return response.json();
}

const confirm = async (
  pending: { id: string; contextVersion: number },
  role: SystemRole = 'dentist'
) =>
  post(
    `/v1/voice/proposals/${pending.id}/confirm`,
    { contextVersion: pending.contextVersion },
    role
  );

const findings = async () =>
  (
    await db.owner.query(
      'SELECT tooth, code FROM clinical.findings WHERE session_id = $1 ORDER BY recorded_at, id',
      [session]
    )
  ).rows as { tooth: string; code: string }[];

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
      await post(
        '/v1/patients',
        { givenName, familyName: 'Confirm', birthDate: '1982-02-02', sex: 'female' },
        'receptionist'
      )
    ).json().id as string;
  sara = await register('Sara');
  omid = await register('Omid');
  session = (await post('/v1/sessions', { patientId: sara })).json().id;
}, 180_000);

beforeEach(async () => {
  await focus({ patientId: sara, sessionId: session, tooth: '16' });
});

afterAll(async () => {
  vi.useRealTimers();
  await app?.close();
  await db?.close();
});

describe('nothing runs when it is only proposed', () => {
  it('records nothing for a command that was understood but not confirmed', async () => {
    const before = (await findings()).length;
    const heard = await say('tooth sixteen occlusal caries', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    expect(heard.pending).toMatchObject({
      type: 'finding.add',
      risk: { base: 'R2', tier: 'R2', confirmation: 'voice_or_click' },
    });
    expect((await findings()).length).toBe(before);
  });
});

describe('confirming by click', () => {
  it('runs the proposal once through the command bus, traced to its interpretation', async () => {
    const { pending } = await say('tooth sixteen occlusal caries', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    const before = (await findings()).length;
    const done = await confirm(pending!);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ command: 'finding.add', commandId: expect.any(String) });
    expect((await findings()).length).toBe(before + 1);

    const row = await db.owner.query(
      'SELECT source, interpretation_id, risk_tier FROM voice.commands WHERE id = $1',
      [done.json().commandId]
    );
    expect(row.rows[0]).toEqual({
      source: 'voice',
      interpretation_id: pending!.id,
      risk_tier: 'R2',
    });
    expect((await context()).pending).toBeNull();

    // A retried confirmation gets the same answer and runs nothing twice.
    const again = await confirm(pending!);
    expect(again.json().commandId).toBe(done.json().commandId);
    expect((await findings()).length).toBe(before + 1);
  });

  it('refuses one that is not ready, from before the screen changed, expired, or replaced', async () => {
    const incomplete = await say('caries', 'finding__add', { finding: 'caries' });
    expect((await confirm(incomplete.pending!)).statusCode).toBe(422);

    const { pending } = await say('occlusal caries on sixteen', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    await focus({ patientId: omid });
    expect((await confirm(pending!)).statusCode).toBe(409);

    await focus({ patientId: sara, sessionId: session, tooth: '16' });
    const fresh = await say('occlusal caries on sixteen', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    vi.useFakeTimers({ now: Date.now() + 3 * 60_000, toFake: ['Date'] });
    try {
      expect((await confirm(fresh.pending!)).statusCode).toBe(410);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('confirming by voice', () => {
  it('runs an R2 proposal on "yes"', async () => {
    await say('occlusal caries on sixteen', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    const before = (await findings()).length;
    const yes = await say('yes', 'confirm_pending');
    expect(yes).toMatchObject({
      outcome: 'control',
      control: { action: 'confirm', ok: true },
      pending: null,
    });
    expect((await findings()).length).toBe(before + 1);
  });

  it('never runs R3 on a spoken yes: signing waits for a click', async () => {
    const visit = (await post('/v1/sessions', { patientId: omid })).json().id;
    await post(`/v1/sessions/${visit}/complete`);
    await focus({ patientId: omid, sessionId: visit });
    const heard = await say('sign the session', 'session__sign');
    expect(heard.pending?.risk).toMatchObject({ tier: 'R3', confirmation: 'click' });
    const yes = await say('yes', 'confirm_pending');
    expect(yes.control).toMatchObject({
      action: 'confirm',
      ok: false,
      message: 'This needs a click on screen to confirm.',
    });
    expect(yes.pending?.id).toBe(heard.pending!.id);
    const status = async () =>
      (await db.owner.query('SELECT status FROM clinical.clinical_sessions WHERE id = $1', [visit]))
        .rows[0].status;
    expect(await status()).toBe('completed');
    expect((await confirm(yes.pending!)).statusCode).toBe(200);
    expect(await status()).toBe('signed');
  });

  it('needs a click when the command was not clearly understood', async () => {
    model.next = {
      kind: 'tool',
      name: 'finding__add',
      input: { tooth: 'sixteen', finding: 'caries', surfaces: 'occlusal', confidence: 0.5 },
    };
    const heard = (
      await post('/v1/voice/interpret', { text: 'caries sixteen occlusal maybe' })
    ).json();
    expect(heard.pending.risk).toMatchObject({
      base: 'R2',
      tier: 'R3',
      confirmation: 'click',
      reasons: ['The command was not clearly understood.'],
    });
    expect((await say('yes', 'confirm_pending')).control.ok).toBe(false);
    expect((await confirm(heard.pending)).statusCode).toBe(200);
  });

  it('cancels on "no", leaving nothing to confirm', async () => {
    await say('occlusal caries on sixteen', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    const no = await say('no', 'cancel_pending');
    expect(no).toMatchObject({ control: { action: 'cancel', ok: true }, pending: null });
  });
});

describe('correcting', () => {
  it('takes "no, tooth twenty six" as a correction; the old proposal can no longer be confirmed', async () => {
    const first = await say('occlusal caries on sixteen', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    const corrected = await say('no, tooth twenty six', 'correct_pending', { tooth: 'twenty six' });
    expect(corrected.control).toMatchObject({ action: 'correct', ok: true });
    expect(corrected.pending).toMatchObject({
      payload: { tooth: '26', code: 'caries', surfaces: ['O'] },
    });
    expect(corrected.pending!.id).not.toBe(first.pending!.id);
    expect((await confirm(first.pending!)).statusCode).toBe(404);
    expect((await confirm(corrected.pending!)).statusCode).toBe(200);
    expect((await findings()).at(-1)).toEqual({ tooth: '26', code: 'caries' });
  });

  it('drops a correction that was not said', async () => {
    await say('occlusal caries on sixteen', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    const wrong = await say('no', 'correct_pending', { tooth: 'twenty six' });
    expect(wrong.outcome).toBe('rejected');
  });

  it('takes typed edits on the card, resolved like speech', async () => {
    const heard = await say('caries on sixteen', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
    });
    expect(heard.pending!.proposal!.ready).toBe(false);
    const edited = await post(`/v1/voice/proposals/${heard.pending!.id}/edit`, {
      contextVersion: heard.pending!.contextVersion,
      entities: { surfaces: 'mesial and occlusal' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      payload: { tooth: '16', surfaces: ['M', 'O'] },
      proposal: { ready: true },
      risk: { tier: 'R2' },
    });
    const bad = await post(`/v1/voice/proposals/${edited.json().id}/edit`, {
      contextVersion: edited.json().contextVersion,
      entities: { patientId: 'x' },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('undo', () => {
  it('proposes the inverse of the last voice command, which must be confirmed too', async () => {
    const { pending } = await say(
      'diagnosis irreversible pulpitis on sixteen',
      'diagnosis__record',
      {
        diagnosis: 'irreversible pulpitis',
        tooth: 'sixteen',
      }
    );
    const recorded = await confirm(pending!);
    const diagnosisId = (recorded.json().result as { id: string }).id;

    const undo = await say('undo that', 'undo_last');
    expect(undo).toMatchObject({
      control: { action: 'undo', ok: true },
      pending: { type: 'diagnosis.retract', payload: { diagnosisId } },
    });
    const status = async () =>
      (await db.owner.query('SELECT status FROM clinical.diagnoses WHERE id = $1', [diagnosisId]))
        .rows[0].status;
    // Proposed, not done.
    expect(await status()).toBe('confirmed');
    expect((await confirm(undo.pending!)).statusCode).toBe(200);
    expect(await status()).toBe('retracted');
  });

  it('says so when the last command has no safe inverse', async () => {
    const { pending } = await say('occlusal caries on sixteen', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    await confirm(pending!);
    const undo = await post('/v1/voice/undo');
    expect(undo.statusCode).toBe(422);
    expect(undo.json().code).toBe('not_undoable');
  });
});

describe('the command bus refuses unconfirmed voice commands (V6 acceptance)', () => {
  const actor = () => ({
    userId: alpha.dentist!,
    clinicId: alpha.clinic!,
    permissions: ['session.write', 'session.sign'],
  });

  it('refuses a voice command without a confirmation, and R3 confirmed by voice', async () => {
    const bus = app.commandBus!;
    await expect(
      bus.execute(
        {
          type: 'note.add',
          payload: { sessionId: session, body: 'Sneaked in' },
          idempotencyKey: randomUUID(),
          source: 'voice',
        },
        actor()
      )
    ).rejects.toMatchObject({ statusCode: 403, code: 'confirmation_required' });
    await expect(
      bus.execute(
        {
          type: 'session.sign',
          payload: { sessionId: session },
          idempotencyKey: randomUUID(),
          source: 'voice',
          confirmation: { interpretationId: randomUUID(), via: 'voice' },
        },
        actor()
      )
    ).rejects.toMatchObject({ statusCode: 403, code: 'confirmation_required' });
  });

  it('left no voice command in any test without the interpretation it confirmed', async () => {
    const unconfirmed = await db.owner.query(
      `SELECT count(*)::int AS n FROM voice.commands
       WHERE source = 'voice' AND status = 'executed' AND interpretation_id IS NULL`
    );
    expect(unconfirmed.rows[0].n).toBe(0);
    const executed = await db.owner.query(
      `SELECT count(*)::int AS n FROM voice.commands WHERE source = 'voice' AND status = 'executed'`
    );
    expect(executed.rows[0].n).toBeGreaterThan(0);
  });

  it('still checks the permission of whoever confirms', async () => {
    await focus({ patientId: sara, sessionId: session }, 'assistant');
    const heard = await say(
      'suggest pulpitis',
      'diagnosis__suggest',
      { diagnosis: 'pulpitis' },
      'assistant'
    );
    expect(heard.pending?.type).toBe('diagnosis.suggest');
    expect((await confirm(heard.pending!, 'assistant')).statusCode).toBe(200);
    expect((await post('/v1/voice/undo', {}, 'receptionist')).statusCode).toBe(403);
  });
});
