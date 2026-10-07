import { randomUUID } from 'node:crypto';
import type { SystemRole, TreatmentPlan } from '@dental/contracts';
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

/** C5 acceptance: items reorder and keep sequence. */

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const alpha: Record<string, string> = {};
const beta: Record<string, string> = {};
let patientId = '';
let planId = '';

async function headers(role: SystemRole, clinic = alpha) {
  const token = await accessToken(tokens, {
    userId: clinic[role]!,
    clinicId: clinic.clinic!,
    role,
  });
  return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
}

async function post(
  url: string,
  payload: Record<string, unknown> = {},
  role: SystemRole = 'dentist'
) {
  return app.inject({ method: 'POST', url, payload, headers: await headers(role) });
}

const addItem = (body: Record<string, unknown>) => post(`/v1/plans/${planId}/items`, body);

const order = (plan: TreatmentPlan) =>
  plan.items.map(
    (item) => `${item.sequence}:${item.procedureType.code}${item.tooth ? `@${item.tooth}` : ''}`
  );

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
    await post(
      '/v1/patients',
      { givenName: 'Pia', familyName: 'Plan', birthDate: '1980-08-08', sex: 'female' },
      'receptionist'
    )
  ).json().id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('the procedure catalog', () => {
  it('lists the seeded procedures to any signed-in user', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/procedure-types',
      headers: await headers('receptionist'),
    });
    const types = response.json().procedureTypes;
    expect(types).toHaveLength(26);
    expect(types.find((t: { code: string }) => t.code === 'root_canal_molar')).toMatchObject({
      category: 'endodontic',
      scope: 'tooth',
      aliases: expect.arrayContaining(['root canal']),
      externalCode: null,
    });
  });
});

describe('a treatment plan', () => {
  it('opens once per patient', async () => {
    const created = await post(`/v1/patients/${patientId}/plans`, { title: 'Upper right' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: 'proposed', version: 1, items: [] });
    planId = created.json().id;

    const again = await post(`/v1/patients/${patientId}/plans`);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'plan_open', planId });
  });

  it('adds items at the end, and after another item', async () => {
    await addItem({ procedureCode: 'root_canal_molar', tooth: '16' });
    await addItem({ procedureCode: 'composite_filling', tooth: '24', surfaces: ['M', 'O'] });
    const withThree = (await addItem({ procedureCode: 'scale_polish' })).json();
    expect(order(withThree)).toEqual([
      '1:root_canal_molar@16',
      '2:composite_filling@24',
      '3:scale_polish',
    ]);

    // "And add a crown afterward": straight after the root canal.
    const afterRoot = await addItem({
      procedureCode: 'crown',
      tooth: '16',
      afterItemId: withThree.items[0].id,
    });
    expect(order(afterRoot.json())).toEqual([
      '1:root_canal_molar@16',
      '2:crown@16',
      '3:composite_filling@24',
      '4:scale_polish',
    ]);
    expect(afterRoot.json().items[2].surfaces).toEqual(['M', 'O']);
  });

  it('validates the procedure against tooth, surfaces and the chart', async () => {
    expect((await addItem({ procedureCode: 'crown' })).statusCode).toBe(400);
    expect((await addItem({ procedureCode: 'scale_polish', tooth: '16' })).statusCode).toBe(400);
    expect((await addItem({ procedureCode: 'composite_filling', tooth: '24' })).statusCode).toBe(
      400
    );
    expect(
      (await addItem({ procedureCode: 'crown', tooth: '24', surfaces: ['M'] })).statusCode
    ).toBe(400);
    expect((await addItem({ procedureCode: 'gold_teeth', tooth: '24' })).statusCode).toBe(422);

    // A tooth charted as missing takes an implant, not a crown.
    const session = (await post('/v1/sessions', { patientId })).json();
    await post(`/v1/sessions/${session.id}/findings`, { tooth: '36', code: 'missing' });
    const crownOnGap = await addItem({ procedureCode: 'crown', tooth: '36' });
    expect(crownOnGap.statusCode).toBe(422);
    expect(crownOnGap.json().title).toContain('missing');
    const implant = await addItem({ procedureCode: 'implant_placement', tooth: '36' });
    expect(implant.statusCode).toBe(201);
  });
});

describe('reordering', () => {
  it('puts items in the new order and keeps one contiguous sequence', async () => {
    const plan = (
      await app.inject({
        method: 'GET',
        url: `/v1/patients/${patientId}/plans`,
        headers: await headers('dentist'),
      })
    ).json().plans[0] as TreatmentPlan;
    const ids = plan.items.map((item) => item.id);
    expect(ids).toHaveLength(5);

    const reversed = [...ids].reverse();
    const response = await post(`/v1/plans/${planId}/reorder`, {
      version: plan.version,
      itemIds: reversed,
    });
    expect(response.statusCode).toBe(200);
    const after = response.json() as TreatmentPlan;
    expect(after.items.map((item) => item.id)).toEqual(reversed);
    expect(after.items.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(after.version).toBe(plan.version + 1);

    // Swap the first two, then insert after the new first: still 1..n with no gaps.
    const swapped = [reversed[1]!, reversed[0]!, ...reversed.slice(2)];
    const second = (
      await post(`/v1/plans/${planId}/reorder`, { version: after.version, itemIds: swapped })
    ).json() as TreatmentPlan;
    expect(second.items.map((item) => item.id)).toEqual(swapped);
    const inserted = (
      await addItem({ procedureCode: 'fluoride_application', afterItemId: swapped[0] })
    ).json() as TreatmentPlan;
    expect(inserted.items.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(inserted.items[1]!.procedureType.code).toBe('fluoride_application');

    // The stored order matches what was returned.
    const stored = (
      await db.owner.query(
        'SELECT id FROM clinical.treatment_plan_items WHERE plan_id = $1 ORDER BY sequence',
        [planId]
      )
    ).rows.map((row) => row.id);
    expect(stored).toEqual(inserted.items.map((item) => item.id));
  });

  it('refuses a reorder made against an older version', async () => {
    const plan = (
      await app.inject({
        method: 'GET',
        url: `/v1/patients/${patientId}/plans`,
        headers: await headers('dentist'),
      })
    ).json().plans[0] as TreatmentPlan;
    const ids = plan.items.map((item) => item.id);
    await addItem({ procedureCode: 'examination' });
    const stale = await post(`/v1/plans/${planId}/reorder`, {
      version: plan.version,
      itemIds: ids,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      code: 'version_conflict',
      currentVersion: plan.version + 1,
    });
  });

  it('refuses an order that leaves out or adds items', async () => {
    const plan = (
      await app.inject({
        method: 'GET',
        url: `/v1/patients/${patientId}/plans`,
        headers: await headers('dentist'),
      })
    ).json().plans[0] as TreatmentPlan;
    const ids = plan.items.map((item) => item.id);
    const missing = await post(`/v1/plans/${planId}/reorder`, {
      version: plan.version,
      itemIds: ids.slice(1),
    });
    expect(missing.statusCode).toBe(400);
    const foreign = await post(`/v1/plans/${planId}/reorder`, {
      version: plan.version,
      itemIds: [...ids.slice(1), randomUUID()],
    });
    expect(foreign.statusCode).toBe(400);
  });
});

describe('the plan lifecycle', () => {
  it('cancels an item, keeping it in place', async () => {
    const plan = (
      await app.inject({
        method: 'GET',
        url: `/v1/patients/${patientId}/plans`,
        headers: await headers('dentist'),
      })
    ).json().plans[0] as TreatmentPlan;
    const target = plan.items[0]!;
    const cancelled = (
      await post(`/v1/plans/${planId}/items/${target.id}/cancel`, { reason: 'Patient declined' })
    ).json() as TreatmentPlan;
    expect(cancelled.items[0]).toMatchObject({
      id: target.id,
      sequence: 1,
      status: 'cancelled',
      cancelReason: 'Patient declined',
    });
    expect((await post(`/v1/plans/${planId}/items/${target.id}/cancel`)).statusCode).toBe(422);
  });

  it('is accepted, then cancelled, and a new plan can open', async () => {
    const accepted = await post(`/v1/plans/${planId}/accept`);
    expect(accepted.json().status).toBe('accepted');
    expect((await post(`/v1/plans/${planId}/accept`)).statusCode).toBe(422);
    const cancelled = await post(`/v1/plans/${planId}/cancel`, { reason: 'Replanned' });
    expect(cancelled.json().status).toBe('cancelled');
    expect((await addItem({ procedureCode: 'examination' })).statusCode).toBe(422);
    expect((await post(`/v1/patients/${patientId}/plans`)).statusCode).toBe(201);
  });

  it('keeps items and plans in the database: no edits, no deletes', async () => {
    await expect(
      db.owner.query(`UPDATE clinical.treatment_plan_items SET tooth = '11'`)
    ).rejects.toThrow(/only moves position/);
    await expect(db.owner.query('DELETE FROM clinical.treatment_plan_items')).rejects.toThrow(
      /cancelled, not deleted/
    );
    await expect(
      db.owner.query(
        `UPDATE clinical.treatment_plans SET status = 'proposed' WHERE status = 'cancelled'`
      )
    ).rejects.toThrow(/only moves proposed/);
  });
});

describe('access', () => {
  it('lets only dentists plan, keeps receptionists out, isolates clinics', async () => {
    const plan = (
      await app.inject({
        method: 'GET',
        url: `/v1/patients/${patientId}/plans`,
        headers: await headers('assistant'),
      })
    ).json().plans[0] as TreatmentPlan;
    const assistantAdd = await post(
      `/v1/plans/${plan.id}/items`,
      { procedureCode: 'examination' },
      'assistant'
    );
    expect(assistantAdd.statusCode).toBe(403);

    const receptionist = await app.inject({
      method: 'GET',
      url: `/v1/patients/${patientId}/plans`,
      headers: await headers('receptionist'),
    });
    expect(receptionist.statusCode).toBe(403);
    const other = await app.inject({
      method: 'GET',
      url: `/v1/patients/${patientId}/plans`,
      headers: await headers('dentist', beta),
    });
    expect(other.statusCode).toBe(404);
  });
});
