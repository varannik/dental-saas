import { randomUUID } from 'node:crypto';
import type { SystemRole } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretBox } from '../../platform/secret-box.js';
import { buildServer } from '../../server.js';
import {
  accessToken,
  createClinic,
  createMember,
  startTestDatabase,
  type TestDatabase,
} from '../../testing/database.js';
import { createDummyHash } from '../identity/passwords.js';
import { IdentityService } from '../identity/service.js';
import { ChallengeTokens, loadSigningKeys, TokenService } from '../identity/tokens.js';

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const alpha: Record<string, string> = {};
const beta: Record<string, string> = {};

async function headers(role: SystemRole, clinic = alpha) {
  const token = await accessToken(tokens, {
    userId: clinic[role]!,
    clinicId: clinic.clinic!,
    role,
  });
  return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
}

const post = async (
  url: string,
  payload: Record<string, unknown>,
  role: SystemRole,
  clinic = alpha
) => app.inject({ method: 'POST', url, payload, headers: await headers(role, clinic) });
const get = async (url: string, role: SystemRole, clinic = alpha) =>
  app.inject({ method: 'GET', url, headers: await headers(role, clinic) });

async function patient(givenName: string, clinic = alpha) {
  return (
    await post(
      '/v1/patients',
      { givenName, familyName: 'Listing', birthDate: '1980-05-05', sex: 'female' },
      'receptionist',
      clinic
    )
  ).json().id as string;
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
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('GET /v1/dashboard', () => {
  it('lists the open sessions of the clinic and the patients I opened, newest first', async () => {
    const first = await patient('First');
    const second = await patient('Second');
    const elsewhere = await patient('Elsewhere', beta);
    await get(`/v1/patients/${first}`, 'dentist');
    await post('/v1/sessions', { patientId: elsewhere }, 'dentist', beta);
    const open = (
      await post('/v1/sessions', { patientId: first, chiefComplaint: 'Pain' }, 'dentist')
    ).json();
    const closed = (await post('/v1/sessions', { patientId: second }, 'dentist')).json();
    await post(`/v1/sessions/${closed.id}/complete`, {}, 'dentist');
    await get(`/v1/patients/${second}`, 'dentist');

    const dashboard = (await get('/v1/dashboard', 'dentist')).json();
    expect(dashboard.openSessions).toEqual([
      expect.objectContaining({
        id: open.id,
        chiefComplaint: 'Pain',
        mine: true,
        patient: expect.objectContaining({
          id: first,
          givenName: 'First',
          birthDate: '1980-05-05',
        }),
      }),
    ]);
    expect(dashboard.recentPatients.map((p: { givenName: string }) => p.givenName)).toEqual([
      'Second',
      'First',
    ]);

    const assistant = (await get('/v1/dashboard', 'assistant')).json();
    expect(assistant.openSessions[0]).toMatchObject({ id: open.id, mine: false });
    expect(assistant.recentPatients).toEqual([]);
  });

  it('shows no sessions to a receptionist, who cannot read clinical content', async () => {
    const [anyone] = (await get('/v1/patients?q=Listing', 'receptionist')).json().results;
    await get(`/v1/patients/${anyone.id}`, 'receptionist');
    const receptionist = await get('/v1/dashboard', 'receptionist');
    expect(receptionist.statusCode).toBe(200);
    expect(receptionist.json().openSessions).toEqual([]);
    expect(receptionist.json().recentPatients).toEqual([
      expect.objectContaining({ id: anyone.id }),
    ]);
  });
});

describe('GET /v1/activity', () => {
  it('lists my executed commands, newest first, with their patient, session and tooth', async () => {
    const id = await patient('Active');
    const session = (await post('/v1/sessions', { patientId: id }, 'dentist')).json();
    await post(
      `/v1/sessions/${session.id}/findings`,
      { tooth: '16', code: 'caries', surfaces: ['O'] },
      'dentist'
    );
    await post(`/v1/sessions/${session.id}/findings`, { tooth: '99', code: 'caries' }, 'dentist');

    const { entries } = (await get('/v1/activity', 'dentist')).json();
    // The refused finding on tooth 99 is not listed.
    expect(entries.map((e: { type: string }) => e.type)).toEqual([
      'finding.add',
      'session.start',
      'session.complete',
      'session.start',
      'session.start',
    ]);
    expect(entries[0]).toMatchObject({
      source: 'gui',
      patientId: id,
      sessionId: session.id,
      tooth: '16',
    });
    expect(entries[1]).toMatchObject({ patientId: id, sessionId: session.id });

    const theirs = (await get('/v1/activity', 'receptionist')).json().entries;
    expect(theirs.every((entry: { type: string }) => entry.type === 'patient.create')).toBe(true);
    expect(theirs.every((entry: { patientId: string | null }) => entry.patientId)).toBe(true);
  });

  it('keeps to the last ten, and to my clinic', async () => {
    const id = await patient('Busy', beta);
    for (let i = 0; i < 6; i += 1) {
      const session = (await post('/v1/sessions', { patientId: id }, 'dentist', beta)).json();
      await post(`/v1/sessions/${session.id}/complete`, {}, 'dentist', beta);
    }
    const entries = (await get('/v1/activity', 'dentist', beta)).json().entries;
    expect(entries).toHaveLength(10);
    expect(entries.every((e: { patientId: string }) => e.patientId === id)).toBe(true);
  });
});
