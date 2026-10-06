import { randomUUID } from 'node:crypto';
import type { SystemRole } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withClinic } from '../../platform/db.js';
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

/** C2 acceptance: ending an entry keeps its history. */

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const alpha: Record<string, string> = {};
const beta: Record<string, string> = {};
let patientId = '';
let archivedId = '';

async function headers(role: SystemRole, clinic = alpha) {
  const token = await accessToken(tokens, {
    userId: clinic[role]!,
    clinicId: clinic.clinic!,
    role,
  });
  return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
}

const add = async (kind: string, body: Record<string, unknown>, role: SystemRole = 'dentist') =>
  app.inject({
    method: 'POST',
    url: `/v1/patients/${patientId}/history/${kind}`,
    payload: body,
    headers: await headers(role),
  });

const end = async (entryId: string, body: Record<string, unknown>, role: SystemRole = 'dentist') =>
  app.inject({
    method: 'POST',
    url: `/v1/patients/${patientId}/history/${entryId}/end`,
    payload: body,
    headers: await headers(role),
  });

const read = async (role: SystemRole = 'dentist', query = '', clinic = alpha, id = patientId) =>
  app.inject({
    method: 'GET',
    url: `/v1/patients/${id}/history${query}`,
    headers: await headers(role, clinic),
  });

beforeAll(async () => {
  db = await startTestDatabase();
  alpha.clinic = await createClinic(db.owner, 'Alpha Dental');
  for (const role of ['dentist', 'assistant', 'receptionist'] as const) {
    alpha[role] = await createMember(db.owner, alpha.clinic, role);
  }
  beta.clinic = await createClinic(db.owner, 'Beta Dental');
  beta.dentist = await createMember(db.owner, beta.clinic, 'dentist');

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

  const register = async (givenName: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/v1/patients',
        payload: { givenName, familyName: 'Patient', birthDate: '1980-05-05', sex: 'female' },
        headers: await headers('receptionist'),
      })
    ).json().id as string;
  patientId = await register('Hana');
  archivedId = await register('Old');
  await app.inject({
    method: 'PATCH',
    url: `/v1/patients/${archivedId}`,
    payload: { version: 1, status: 'archived' },
    headers: await headers('receptionist'),
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('recording history', () => {
  const ids: Record<string, string> = {};

  it('adds entries of every kind and returns them grouped', async () => {
    const allergy = await add('allergy', {
      label: 'Penicillin',
      severity: 'severe',
      detail: 'Anaphylaxis',
    });
    expect(allergy.statusCode).toBe(201);
    expect(allergy.json()).toMatchObject({
      kind: 'allergy',
      label: 'Penicillin',
      severity: 'severe',
      status: 'active',
      notedBy: alpha.dentist,
    });
    ids.penicillin = allergy.json().id;
    ids.warfarin = (await add('medication', { label: 'Warfarin', detail: '5 mg daily' })).json().id;
    ids.diabetes = (
      await add('condition', { label: 'Type 2 diabetes', onsetDate: '2015-03-01' })
    ).json().id;
    ids.smoker = (await add('risk_factor', { label: 'Smoker', detail: '10 a day' })).json().id;

    const history = (await read()).json();
    expect(history.allergies.map((e: { label: string }) => e.label)).toEqual(['Penicillin']);
    expect(history.medications[0]).toMatchObject({ label: 'Warfarin', detail: '5 mg daily' });
    expect(history.conditions[0]).toMatchObject({ onsetDate: '2015-03-01' });
    expect(history.riskFactors[0]).toMatchObject({ label: 'Smoker' });
  });

  it('ends an entry and keeps it, with who, when and why', async () => {
    const ended = await end(ids.warfarin!, { reason: 'stopped', note: 'Before extraction' });
    expect(ended.statusCode).toBe(200);
    expect(ended.json()).toMatchObject({
      status: 'ended',
      endReason: 'stopped',
      endNote: 'Before extraction',
      endedBy: alpha.dentist,
      label: 'Warfarin',
      detail: '5 mg daily',
    });

    expect((await read()).json().medications).toEqual([]);
    const all = (await read('dentist', '?includeEnded=true')).json();
    expect(all.medications).toHaveLength(1);
    expect(all.medications[0]).toMatchObject({ label: 'Warfarin', status: 'ended' });

    const audit = (
      await db.owner.query(
        `SELECT action, before, after FROM audit.audit_log WHERE entity_id = $1 ORDER BY seq`,
        [ids.warfarin]
      )
    ).rows;
    expect(audit.map((row) => row.action)).toEqual(['history.add', 'history.end']);
    expect(audit[1]).toMatchObject({
      before: { status: 'active' },
      after: { status: 'ended', reason: 'stopped' },
    });
  });

  it('refuses to end an entry twice', async () => {
    const again = await end(ids.warfarin!, { reason: 'resolved' });
    expect(again.statusCode).toBe(422);
  });

  it('records a correction as entered in error, then a new entry', async () => {
    await end(ids.smoker!, { reason: 'entered_in_error', note: 'Former smoker' });
    const corrected = await add('risk_factor', { label: 'Former smoker' });
    expect(corrected.statusCode).toBe(201);
    const all = (await read('dentist', '?includeEnded=true')).json();
    expect(
      all.riskFactors.map((e: { label: string; status: string }) => [e.label, e.status])
    ).toEqual([
      ['Former smoker', 'active'],
      ['Smoker', 'ended'],
    ]);
  });

  it('warns when the same entry is already active', async () => {
    const twice = await add('allergy', { label: 'penicillin' });
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({
      code: 'possible_duplicate',
      candidates: [{ id: ids.penicillin, label: 'Penicillin' }],
    });
  });

  it('validates the entry', async () => {
    expect((await add('condition', { label: 'Asthma', severity: 'mild' })).statusCode).toBe(400);
    expect((await add('habit', { label: 'x' })).statusCode).toBe(400);
  });

  it('takes no new entries for an archived patient', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/patients/${archivedId}/history/allergy`,
      payload: { label: 'Latex' },
      headers: await headers('dentist'),
    });
    expect(response.statusCode).toBe(422);
  });
});

describe('history is ended, not overwritten', () => {
  it('rejects editing or deleting an entry in the database, also for the owner', async () => {
    await expect(
      withClinic(db.pool, alpha.clinic!, (client) =>
        client.query(`UPDATE clinical.history_entries SET label = 'Amoxicillin'`)
      )
    ).rejects.toThrow(/ended, not overwritten/);
    await expect(db.owner.query(`DELETE FROM clinical.history_entries`)).rejects.toThrow(
      /ended, not deleted/
    );
    await expect(
      db.owner.query(
        `UPDATE clinical.history_entries SET status = 'active', ended_at = NULL,
           end_reason = NULL, ended_by = NULL, end_note = NULL
         WHERE status = 'ended'`
      )
    ).rejects.toThrow(/ended, not overwritten/);
  });
});

describe('who can see and change history', () => {
  it('lets an assistant read but not write', async () => {
    expect((await read('assistant')).statusCode).toBe(200);
    expect((await add('allergy', { label: 'Latex' }, 'assistant')).statusCode).toBe(403);
  });

  it('shows receptionists no clinical content', async () => {
    expect((await read('receptionist')).statusCode).toBe(403);
  });

  it('records every read', async () => {
    const reads = (
      await db.owner.query(
        `SELECT count(*)::int AS n FROM audit.access_log
         WHERE patient_id = $1 AND purpose = 'patient.history'`,
        [patientId]
      )
    ).rows[0].n;
    expect(reads).toBeGreaterThanOrEqual(5);
  });

  it('never shows one clinic the history of another', async () => {
    expect((await read('dentist', '', beta)).statusCode).toBe(404);
  });
});
