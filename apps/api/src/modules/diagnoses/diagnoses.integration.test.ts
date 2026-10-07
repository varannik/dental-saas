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

/** C4 acceptance: an assistant role cannot confirm. */

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const alpha: Record<string, string> = {};
const beta: Record<string, string> = {};
let patientId = '';
let sessionId = '';

async function headers(role: SystemRole, clinic = alpha) {
  const token = await accessToken(tokens, {
    userId: clinic[role]!,
    clinicId: clinic.clinic!,
    role,
  });
  return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
}

const add = async (
  body: Record<string, unknown>,
  role: SystemRole = 'dentist',
  session = sessionId
) =>
  app.inject({
    method: 'POST',
    url: `/v1/sessions/${session}/diagnoses`,
    payload: body,
    headers: await headers(role),
  });

const decide = async (id: string, body: Record<string, unknown>, role: SystemRole = 'dentist') =>
  app.inject({
    method: 'PATCH',
    url: `/v1/diagnoses/${id}`,
    payload: body,
    headers: await headers(role),
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

  patientId = (
    await app.inject({
      method: 'POST',
      url: '/v1/patients',
      payload: {
        givenName: 'Dina',
        familyName: 'Diagnosis',
        birthDate: '1975-03-03',
        sex: 'female',
      },
      headers: await headers('receptionist'),
    })
  ).json().id;
  sessionId = (
    await app.inject({
      method: 'POST',
      url: '/v1/sessions',
      payload: { patientId },
      headers: await headers('assistant'),
    })
  ).json().id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('an assistant', () => {
  let suggestedId = '';

  it('can suggest a diagnosis', async () => {
    const response = await add(
      { tooth: '16', code: 'irreversible_pulpitis', certainty: 'probable' },
      'assistant'
    );
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: 'suggested',
      tooth: '16',
      code: 'irreversible_pulpitis',
      suggestedBy: alpha.assistant,
      decidedBy: null,
    });
    suggestedId = response.json().id;
  });

  it('cannot confirm, record a confirmed diagnosis, reject or retract', async () => {
    const confirm = await decide(suggestedId, { status: 'confirmed' }, 'assistant');
    expect(confirm.statusCode).toBe(403);
    expect(confirm.json()).toMatchObject({ code: 'forbidden' });

    expect(
      (await add({ tooth: '16', code: 'pulp_necrosis', status: 'confirmed' }, 'assistant'))
        .statusCode
    ).toBe(403);
    expect((await decide(suggestedId, { status: 'rejected' }, 'assistant')).statusCode).toBe(403);

    const row = (
      await db.owner.query('SELECT status FROM clinical.diagnoses WHERE id = $1', [suggestedId])
    ).rows[0];
    expect(row.status).toBe('suggested');
    // A refused command leaves no trace in the command log.
    const commands = (
      await db.owner.query(
        `SELECT count(*)::int AS n FROM voice.commands
         WHERE type IN ('diagnosis.confirm', 'diagnosis.record') AND actor_id = $1`,
        [alpha.assistant]
      )
    ).rows[0].n;
    expect(commands).toBe(0);
  });

  it('is confirmed by a dentist, with who and when', async () => {
    const confirmed = await decide(suggestedId, { status: 'confirmed' });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      status: 'confirmed',
      suggestedBy: alpha.assistant,
      decidedBy: alpha.dentist,
    });
    expect(confirmed.json().decidedAt).not.toBeNull();
  });
});

describe('a dentist', () => {
  it('records a confirmed diagnosis directly, and one for the whole mouth', async () => {
    const tooth = await add({ tooth: '26', code: 'apical_periodontitis', status: 'confirmed' });
    expect(tooth.json()).toMatchObject({ status: 'confirmed', decidedBy: alpha.dentist });
    const mouth = await add({ code: 'gingivitis', status: 'confirmed', certainty: 'definite' });
    expect(mouth.json()).toMatchObject({ tooth: null, code: 'gingivitis' });
  });

  it('rejects a suggestion', async () => {
    const suggested = (await add({ tooth: '36', code: 'cracked_tooth' }, 'assistant')).json();
    const rejected = await decide(suggested.id, {
      status: 'rejected',
      reason: 'No crack on transillumination',
    });
    expect(rejected.json()).toMatchObject({
      status: 'rejected',
      reason: 'No crack on transillumination',
    });
  });

  it('retracts a confirmed diagnosis only with a reason', async () => {
    const confirmed = (
      await add({ tooth: '46', code: 'caries_dentine', status: 'confirmed' })
    ).json();
    expect((await decide(confirmed.id, { status: 'retracted' })).statusCode).toBe(400);
    const retracted = await decide(confirmed.id, { status: 'retracted', reason: 'Wrong tooth' });
    expect(retracted.json()).toMatchObject({ status: 'retracted', reason: 'Wrong tooth' });
  });

  it('cannot move a diagnosis the wrong way', async () => {
    const confirmed = (await add({ tooth: '47', code: 'tooth_wear', status: 'confirmed' })).json();
    const again = await decide(confirmed.id, { status: 'confirmed' });
    expect(again.statusCode).toBe(422);
    const rejectConfirmed = await decide(confirmed.id, { status: 'rejected' });
    expect(rejectConfirmed.statusCode).toBe(422);
  });

  it('needs a description for "other"', async () => {
    expect((await add({ code: 'other', status: 'confirmed' })).statusCode).toBe(400);
    expect(
      (await add({ code: 'other', label: 'Bruxism', status: 'confirmed' })).json()
    ).toMatchObject({ code: 'other', label: 'Bruxism' });
  });
});

describe('the record', () => {
  it('shows diagnoses in the session and on the patient', async () => {
    const detail = (
      await app.inject({
        method: 'GET',
        url: `/v1/sessions/${sessionId}`,
        headers: await headers('dentist'),
      })
    ).json();
    expect(detail.diagnoses.length).toBeGreaterThanOrEqual(6);
    expect(detail.diagnoses[0]).toMatchObject({
      code: 'irreversible_pulpitis',
      status: 'confirmed',
    });

    const all = (
      await app.inject({
        method: 'GET',
        url: `/v1/patients/${patientId}/diagnoses`,
        headers: await headers('assistant'),
      })
    ).json();
    expect(all.diagnoses.map((d: { status: string }) => d.status)).toEqual(
      expect.arrayContaining(['confirmed', 'rejected', 'retracted'])
    );
  });

  it('enforces the transitions in the database, also for the owner', async () => {
    await expect(
      db.owner.query(`UPDATE clinical.diagnoses SET code = 'pulp_necrosis'`)
    ).rejects.toThrow(/only moves from suggested/);
    await expect(
      db.owner.query(
        `UPDATE clinical.diagnoses SET status = 'suggested', decided_at = NULL WHERE status = 'rejected'`
      )
    ).rejects.toThrow(/only moves from suggested/);
    await expect(db.owner.query('DELETE FROM clinical.diagnoses')).rejects.toThrow(/never deleted/);
  });

  it('audits every step', async () => {
    const actions = (
      await db.owner.query(
        `SELECT DISTINCT action FROM audit.audit_log WHERE entity = 'diagnosis' ORDER BY action`
      )
    ).rows.map((row) => row.action);
    expect(actions).toEqual([
      'diagnosis.confirm',
      'diagnosis.record',
      'diagnosis.reject',
      'diagnosis.retract',
      'diagnosis.suggest',
    ]);
  });

  it('closes with the session, hides from receptionists and other clinics', async () => {
    await app.inject({
      method: 'POST',
      url: `/v1/sessions/${sessionId}/complete`,
      headers: await headers('dentist'),
    });
    const late = await add({ tooth: '11', code: 'caries_enamel' });
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe('session_closed');

    const receptionist = await app.inject({
      method: 'GET',
      url: `/v1/patients/${patientId}/diagnoses`,
      headers: await headers('receptionist'),
    });
    expect(receptionist.statusCode).toBe(403);
    const other = await app.inject({
      method: 'GET',
      url: `/v1/patients/${patientId}/diagnoses`,
      headers: await headers('dentist', beta),
    });
    expect(other.statusCode).toBe(404);
  });
});
