import { randomUUID } from 'node:crypto';
import type { SystemRole, TreatmentPlan } from '@dental/contracts';
import { uuidv7 } from '@dental/db';
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

/** C6 acceptance: any write to a signed session fails except through an amendment. */

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const alpha: Record<string, string> = {};
let patientId = '';
let sessionId = '';
let plan: TreatmentPlan;
let diagnosisId = '';

async function headers(role: SystemRole) {
  const token = await accessToken(tokens, { userId: alpha[role]!, clinicId: alpha.clinic!, role });
  return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
}

async function post(
  url: string,
  payload: Record<string, unknown> = {},
  role: SystemRole = 'dentist'
) {
  return app.inject({ method: 'POST', url, payload, headers: await headers(role) });
}

async function patch(url: string, payload: Record<string, unknown>, role: SystemRole = 'dentist') {
  return app.inject({ method: 'PATCH', url, payload, headers: await headers(role) });
}

const detail = async () =>
  (
    await app.inject({
      method: 'GET',
      url: `/v1/sessions/${sessionId}`,
      headers: await headers('dentist'),
    })
  ).json();

const chart = async () =>
  (
    await app.inject({
      method: 'GET',
      url: `/v1/patients/${patientId}/chart`,
      headers: await headers('dentist'),
    })
  )
    .json()
    .entries.map(
      (e: { tooth: string; surface: string | null; state: string }) =>
        `${e.tooth}${e.surface ? `:${e.surface}` : ''}=${e.state}`
    );

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
  });

  patientId = (
    await post(
      '/v1/patients',
      { givenName: 'Sig', familyName: 'Nature', birthDate: '1970-01-01', sex: 'male' },
      'receptionist'
    )
  ).json().id;
  const planId = (await post(`/v1/patients/${patientId}/plans`)).json().id;
  await post(`/v1/plans/${planId}/items`, { procedureCode: 'root_canal_molar', tooth: '16' });
  await post(`/v1/plans/${planId}/items`, {
    procedureCode: 'composite_filling',
    tooth: '24',
    surfaces: ['M', 'O'],
  });
  plan = (await post(`/v1/plans/${planId}/accept`)).json();
  sessionId = (await post('/v1/sessions', { patientId, chiefComplaint: 'Pain 16' })).json().id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('procedures', () => {
  let rootCanalId = '';

  it('start from a planned item, refusing a second start of the same item', async () => {
    const started = await post(`/v1/sessions/${sessionId}/procedures`, {
      planItemId: plan.items[0]!.id,
    });
    expect(started.statusCode).toBe(201);
    expect(started.json()).toMatchObject({
      status: 'in_progress',
      tooth: '16',
      procedureType: { code: 'root_canal_molar' },
      planItemId: plan.items[0]!.id,
    });
    rootCanalId = started.json().id;
    const twice = await post(`/v1/sessions/${sessionId}/procedures`, {
      planItemId: plan.items[0]!.id,
    });
    expect(twice.statusCode).toBe(409);
  });

  it('keep the session open while one is in progress', async () => {
    const early = await post(`/v1/sessions/${sessionId}/complete`);
    expect(early.statusCode).toBe(422);
  });

  it('complete: the plan item is done and the chart shows the result', async () => {
    const done = await patch(`/v1/procedures/${rootCanalId}`, { status: 'completed' });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'completed', endedBy: alpha.dentist });

    const filling = (
      await post(`/v1/sessions/${sessionId}/procedures`, { planItemId: plan.items[1]!.id })
    ).json();
    await patch(`/v1/procedures/${filling.id}`, { status: 'completed' });

    expect(await chart()).toEqual([
      '16=root_canal_treated',
      '24:M=restoration',
      '24:O=restoration',
    ]);
    const plans = (
      await app.inject({
        method: 'GET',
        url: `/v1/patients/${patientId}/plans`,
        headers: await headers('dentist'),
      })
    ).json().plans;
    expect(plans[0]).toMatchObject({ status: 'completed' });
    expect(plans[0].items.map((i: { status: string }) => i.status)).toEqual(['done', 'done']);
  });

  it('start ad hoc, and cancel', async () => {
    const adHoc = await post(`/v1/sessions/${sessionId}/procedures`, {
      procedureCode: 'scale_polish',
    });
    expect(adHoc.statusCode).toBe(201);
    const cancelled = await patch(`/v1/procedures/${adHoc.json().id}`, {
      status: 'cancelled',
      reason: 'Out of time',
    });
    expect(cancelled.json()).toMatchObject({ status: 'cancelled', cancelReason: 'Out of time' });
    expect(
      (await patch(`/v1/procedures/${adHoc.json().id}`, { status: 'completed' })).statusCode
    ).toBe(422);
  });

  it('are performed by dentists only', async () => {
    const assistant = await post(
      `/v1/sessions/${sessionId}/procedures`,
      { procedureCode: 'examination' },
      'assistant'
    );
    expect(assistant.statusCode).toBe(403);
  });
});

describe('signing', () => {
  it('needs a completed session and a dentist', async () => {
    diagnosisId = (
      await post(`/v1/sessions/${sessionId}/diagnoses`, {
        tooth: '16',
        code: 'irreversible_pulpitis',
        status: 'confirmed',
      })
    ).json().id;
    await post(`/v1/sessions/${sessionId}/notes`, { body: 'RCT 16 completed.' });

    expect((await post(`/v1/sessions/${sessionId}/sign`)).statusCode).toBe(422);
    await post(`/v1/sessions/${sessionId}/complete`);
    expect((await post(`/v1/sessions/${sessionId}/sign`, {}, 'assistant')).statusCode).toBe(403);

    const signed = await post(`/v1/sessions/${sessionId}/sign`);
    expect(signed.statusCode).toBe(200);
    expect(signed.json()).toMatchObject({ status: 'signed', signedBy: alpha.dentist });
    expect((await post(`/v1/sessions/${sessionId}/sign`)).statusCode).toBe(409);
  });
});

describe('a signed session', () => {
  it('refuses every write through the API', async () => {
    const attempts = await Promise.all([
      post(`/v1/sessions/${sessionId}/findings`, { tooth: '17', code: 'missing' }),
      post(`/v1/sessions/${sessionId}/perio`, {
        measurements: [{ tooth: '16', site: 'MB', pocketDepth: 3 }],
      }),
      post(`/v1/sessions/${sessionId}/notes`, { body: 'Late note' }),
      post(`/v1/sessions/${sessionId}/diagnoses`, {
        tooth: '17',
        code: 'pulp_necrosis',
        status: 'confirmed',
      }),
      post(
        `/v1/sessions/${sessionId}/diagnoses`,
        { tooth: '17', code: 'pulp_necrosis' },
        'assistant'
      ),
      patch(`/v1/diagnoses/${diagnosisId}`, { status: 'retracted', reason: 'x' }),
      post(`/v1/sessions/${sessionId}/procedures`, { procedureCode: 'examination' }),
      post(`/v1/sessions/${sessionId}/complete`),
    ]);
    for (const response of attempts) {
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('session_signed');
    }
  });

  it('refuses every write in the database too, also for the owner', async () => {
    const owner = db.owner;
    const base = [alpha.clinic, sessionId, patientId];
    const attempts: [string, unknown[]][] = [
      [
        `INSERT INTO clinical.findings (id, clinic_id, session_id, patient_id, tooth, code)
         VALUES ($4, $1, $2, $3, '17', 'missing')`,
        [...base, uuidv7()],
      ],
      [
        `INSERT INTO clinical.clinical_notes (id, clinic_id, session_id, type, body)
         VALUES ($3, $1, $2, 'clinical', 'Sneaky')`,
        [alpha.clinic, sessionId, uuidv7()],
      ],
      [
        `INSERT INTO clinical.perio_measurements (id, clinic_id, session_id, patient_id, tooth, site, pocket_depth)
         VALUES ($4, $1, $2, $3, '16', 'B', 9)`,
        [...base, uuidv7()],
      ],
      [
        `UPDATE clinical.diagnoses SET status = 'retracted', reason = 'x', decided_at = now() WHERE id = $1`,
        [diagnosisId],
      ],
    ];
    for (const [sql, params] of attempts) {
      await expect(owner.query(sql, params)).rejects.toThrow(/signed; changes need an amendment/);
    }
    // Nor can the session itself be changed.
    await expect(
      owner.query(
        `UPDATE clinical.clinical_sessions SET chief_complaint = 'Edited' WHERE id = $1`,
        [sessionId]
      )
    ).rejects.toThrow(/only moves/);
  });

  it('is corrected through an amendment, which marks what it wrote', async () => {
    const amended = await post(`/v1/sessions/${sessionId}/amendments`, {
      reason: 'Tooth 17 was missed at examination',
      actions: [
        { type: 'note.add', payload: { body: 'Addendum: 17 is missing; noted after signing.' } },
        { type: 'finding.add', payload: { tooth: '17', code: 'missing' } },
        {
          type: 'diagnosis.retract',
          payload: { diagnosisId, reason: 'Pulp was necrotic, not inflamed' },
        },
        { type: 'diagnosis.record', payload: { tooth: '16', code: 'pulp_necrosis' } },
      ],
    });
    expect(amended.statusCode).toBe(201);
    const amendmentId = amended.json().amendment.id;

    const session = await detail();
    expect(session.status).toBe('signed');
    expect(session.amendments).toEqual([
      expect.objectContaining({ id: amendmentId, reason: 'Tooth 17 was missed at examination' }),
    ]);
    expect(session.notes.at(-1)).toMatchObject({
      amendmentId,
      body: expect.stringContaining('Addendum'),
    });
    expect(session.findings.at(-1)).toMatchObject({ amendmentId, tooth: '17', code: 'missing' });
    expect(session.diagnoses.find((d: { id: string }) => d.id === diagnosisId)).toMatchObject({
      status: 'retracted',
      amendmentId,
    });
    expect(session.diagnoses.at(-1)).toMatchObject({
      code: 'pulp_necrosis',
      status: 'confirmed',
      amendmentId,
    });
    expect(await chart()).toContain('17=missing');

    const audit = (
      await db.owner.query(
        `SELECT action FROM audit.audit_log WHERE after->>'amendmentId' = $1 ORDER BY seq`,
        [amendmentId]
      )
    ).rows.map((row) => row.action);
    expect(audit).toEqual([
      'session.amend',
      'note.add',
      'finding.add',
      'diagnosis.retract',
      'diagnosis.record',
    ]);
  });

  it('rolls back the whole amendment when one action fails, and keeps the rules', async () => {
    const before = (await detail()).notes.length;
    const broken = await post(`/v1/sessions/${sessionId}/amendments`, {
      reason: 'Partly invalid',
      actions: [
        { type: 'note.add', payload: { body: 'Should not stay' } },
        { type: 'finding.add', payload: { tooth: '19', code: 'missing' } },
      ],
    });
    expect(broken.statusCode).toBe(400);
    expect((await detail()).notes.length).toBe(before);

    expect(
      (
        await post(`/v1/sessions/${sessionId}/amendments`, {
          reason: 'No',
          actions: [{ type: 'note.add', payload: { body: 'x' } }],
        })
      ).statusCode
    ).toBe(400);
    const assistant = await post(
      `/v1/sessions/${sessionId}/amendments`,
      { reason: 'Assistant tries', actions: [{ type: 'note.add', payload: { body: 'x' } }] },
      'assistant'
    );
    expect(assistant.statusCode).toBe(403);
    const notAllowed = await post(`/v1/sessions/${sessionId}/amendments`, {
      reason: 'Sneak in a procedure',
      actions: [{ type: 'procedure.start', payload: { procedureCode: 'examination' } }],
    });
    expect(notAllowed.statusCode).toBe(400);
  });

  it('cannot be amended with an amendment of another session', async () => {
    const other = (await post('/v1/sessions', { patientId })).json().id;
    await post(`/v1/sessions/${other}/complete`);
    await post(`/v1/sessions/${other}/sign`);
    const foreignAmendment = (
      await post(`/v1/sessions/${other}/amendments`, {
        reason: 'Other session',
        actions: [{ type: 'note.add', payload: { body: 'Fine here' } }],
      })
    ).json().amendment.id;
    await expect(
      db.owner.query(
        `INSERT INTO clinical.clinical_notes (id, clinic_id, session_id, type, body, amendment_id)
         VALUES ($1, $2, $3, 'clinical', 'Wrong session', $4)`,
        [uuidv7(), alpha.clinic, sessionId, foreignAmendment]
      )
    ).rejects.toThrow(/signed; changes need an amendment/);
  });
});
