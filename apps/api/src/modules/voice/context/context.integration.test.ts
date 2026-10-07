import { randomUUID } from 'node:crypto';
import type { SystemRole } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

/** V3 acceptance: changing patient clears the focus and the pending proposal. */

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const alpha: Record<string, string> = {};
const beta: Record<string, string> = {};
let sara = '';
let omid = '';
let saraSession = '';
let omidSession = '';
let betaPatient = '';

async function headers(role: SystemRole, clinic = alpha) {
  const token = await accessToken(tokens, {
    userId: clinic[role]!,
    clinicId: clinic.clinic!,
    role,
  });
  return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
}

const focus = async (body: Record<string, unknown>, role: SystemRole = 'dentist', clinic = alpha) =>
  app.inject({
    method: 'PUT',
    url: '/v1/voice/context/focus',
    payload: body,
    headers: await headers(role, clinic),
  });
const context = async (role: SystemRole = 'dentist') =>
  (
    await app.inject({ method: 'GET', url: '/v1/voice/context', headers: await headers(role) })
  ).json();

async function patient(givenName: string, clinic = alpha) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/patients',
    payload: { givenName, familyName: 'Context', birthDate: '1985-01-01', sex: 'female' },
    headers: await headers('receptionist', clinic),
  });
  return response.json().id as string;
}

async function session(patientId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/sessions',
    payload: { patientId },
    headers: await headers('dentist'),
  });
  return response.json().id as string;
}

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
  });
  sara = await patient('Sara');
  omid = await patient('Omid');
  betaPatient = await patient('Elsewhere', beta);
  saraSession = await session(sara);
  omidSession = await session(omid);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('the voice context', () => {
  it('starts empty, and is only for clinicians who use voice', async () => {
    expect(await context()).toMatchObject({ patientId: null, version: 0, pending: null });
    const receptionist = await app.inject({
      method: 'GET',
      url: '/v1/voice/context',
      headers: await headers('receptionist'),
    });
    expect(receptionist.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/voice/context' })).statusCode).toBe(401);
  });

  it('changing patient clears the focus and discards the pending proposal (V3 acceptance)', async () => {
    const opened = await focus({ patientId: sara, sessionId: saraSession, tooth: '16' });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toMatchObject({ patientId: sara, sessionId: saraSession, tooth: '16' });
    const key = { clinicId: alpha.clinic!, userId: alpha.dentist! };
    const withProposal = await app.voiceContext!.propose(key, {
      id: 'p1',
      type: 'plan_item.add',
      payload: { procedureCode: 'crown' },
      missing: [],
    });
    expect(withProposal.pending).toMatchObject({ id: 'p1', contextVersion: opened.json().version });

    const switched = (await focus({ patientId: omid })).json();
    expect(switched).toMatchObject({
      patientId: omid,
      sessionId: null,
      procedureId: null,
      tooth: null,
      pending: null,
      version: opened.json().version + 1,
    });
    // A confirmation of the old proposal fails safely.
    expect(await app.voiceContext!.take(key, 'p1', opened.json().version)).toEqual({
      ok: false,
      reason: 'context_changed',
    });
  });

  it('keeps the version and the proposal while only the tooth moves', async () => {
    const start = (await focus({ patientId: omid, sessionId: omidSession, tooth: '26' })).json();
    const key = { clinicId: alpha.clinic!, userId: alpha.dentist! };
    await app.voiceContext!.propose(key, {
      id: 'p2',
      type: 'finding.add',
      payload: {},
      missing: [],
    });
    const moved = (await focus({ patientId: omid, sessionId: omidSession, tooth: '27' })).json();
    expect(moved).toMatchObject({ tooth: '27', version: start.version, pending: { id: 'p2' } });
    expect(await app.voiceContext!.take(key, 'p2', moved.version)).toMatchObject({ ok: true });
  });

  it('only takes focus that belongs together', async () => {
    expect((await focus({ patientId: sara, sessionId: omidSession })).statusCode).toBe(422);
    expect(
      (await focus({ patientId: sara, sessionId: saraSession, procedureId: randomUUID() }))
        .statusCode
    ).toBe(422);
    expect((await focus({ patientId: randomUUID() })).statusCode).toBe(404);
    // Another clinic's patient does not exist here.
    expect((await focus({ patientId: betaPatient })).statusCode).toBe(404);
    expect((await focus({ patientId: sara, tooth: '19' })).statusCode).toBe(400);
    expect((await focus({ patientId: 'not-a-uuid' })).statusCode).toBe(400);
  });

  it('is kept per clinician', async () => {
    await focus({ patientId: sara }, 'assistant');
    await focus({ patientId: omid }, 'dentist');
    expect((await context('assistant')).patientId).toBe(sara);
    expect((await context('dentist')).patientId).toBe(omid);
  });

  it('is cleared by closing the patient', async () => {
    const closed = (await focus({ patientId: null })).json();
    expect(closed).toMatchObject({ patientId: null, sessionId: null, tooth: null });
  });
});
