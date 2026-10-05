import { randomUUID } from 'node:crypto';
import { uuidv7 } from '@dental/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, withClinic, type Pool } from '../../platform/db.js';
import { SecretBox } from '../../platform/secret-box.js';
import { buildServer } from '../../server.js';
import { accessToken, startTestDatabase, type TestDatabase } from '../../testing/database.js';
import { verifyChain } from '../audit/chain.js';
import { CommandBus, type CommandOutcome } from '../commands/bus.js';
import { createDummyHash, hashPassword } from '../identity/passwords.js';
import { IdentityService } from '../identity/service.js';
import { ChallengeTokens, loadSigningKeys, TokenService } from '../identity/tokens.js';
import { registerOnboarding, type OnboardResult } from './onboard.js';

/**
 * F10 acceptance: two clinics with different settings coexist. Onboarding runs as the
 * operator CLI does, as the system actor on the owner connection.
 */

let db: TestDatabase;
let ownerPool: Pool;
let bus: CommandBus;
let app: FastifyInstance;
let tokens: TokenService;
const PASSWORD = 'one-time password for tests';

const london = {
  name: 'Thames Dental',
  country: 'GB',
  currency: 'GBP',
  timezone: 'Europe/London',
  defaultLocale: 'en',
  regulatoryProfile: 'standard',
};
const tehran = {
  name: 'Tehran Smile',
  country: 'IR',
  currency: 'IRR',
  timezone: 'Asia/Tehran',
  defaultLocale: 'fa-IR',
  regulatoryProfile: 'standard',
};

async function onboard(settings: Record<string, unknown>, adminEmail: string) {
  return bus.execute(
    {
      type: 'clinic.onboard',
      payload: {
        ...settings,
        admin: { email: adminEmail, passwordHash: await hashPassword(PASSWORD) },
      },
      idempotencyKey: randomUUID(),
      source: 'system',
    },
    { userId: null, clinicId: uuidv7(), permissions: ['platform.manage'] }
  );
}

const resultOf = (outcome: CommandOutcome) => outcome.result as OnboardResult;

beforeAll(async () => {
  db = await startTestDatabase();
  ownerPool = createPool(db.ownerUrl);
  bus = new CommandBus(ownerPool);
  registerOnboarding(bus);
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
    },
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await ownerPool?.end();
  await db?.close();
});

describe('clinic onboarding', () => {
  let a: OnboardResult;
  let b: OnboardResult;

  it('onboards two clinics with different settings', async () => {
    a = resultOf(await onboard(london, 'owner@thames.test'));
    b = resultOf(await onboard(tehran, 'owner@tehran.test'));
    expect(a.adminCreated).toBe(true);
    expect(b.clinicId).not.toBe(a.clinicId);

    const rows = (
      await db.owner.query(
        `SELECT c.id, c.name, c.country, c.currency, c.timezone, c.default_locale, c.tooth_notation,
                p.key AS profile
         FROM core.clinics c JOIN core.regulatory_profiles p ON p.id = c.regulatory_profile_id
         WHERE c.id = ANY($1) ORDER BY c.name`,
        [[a.clinicId, b.clinicId]]
      )
    ).rows;
    expect(rows).toEqual([
      {
        id: b.clinicId,
        name: 'Tehran Smile',
        country: 'IR',
        currency: 'IRR',
        timezone: 'Asia/Tehran',
        default_locale: 'fa-IR',
        tooth_notation: 'FDI',
        profile: 'standard',
      },
      {
        id: a.clinicId,
        name: 'Thames Dental',
        country: 'GB',
        currency: 'GBP',
        timezone: 'Europe/London',
        default_locale: 'en',
        tooth_notation: 'FDI',
        profile: 'standard',
      },
    ]);
  });

  it('gives each administrator only their own clinic', async () => {
    for (const [clinic, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const token = await accessToken(tokens, {
        userId: clinic.adminUserId,
        clinicId: clinic.clinicId,
        role: 'admin',
      });
      const me = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().clinic.id).toBe(clinic.clinicId);

      const visible = await withClinic(db.pool, clinic.clinicId, async (client) =>
        (await client.query<{ id: string }>('SELECT id FROM core.clinics')).rows.map(
          (row) => row.id
        )
      );
      expect(visible).toEqual([clinic.clinicId]);
      expect(visible).not.toContain(other.clinicId);
    }
  });

  it('starts each clinic with its own audit chain', async () => {
    for (const clinic of [a, b]) {
      const entries = (
        await db.owner.query(
          `SELECT seq, action, actor_id FROM audit.audit_log WHERE clinic_id = $1 ORDER BY seq`,
          [clinic.clinicId]
        )
      ).rows;
      expect(entries).toEqual([
        { seq: '1', action: 'clinic.onboard', actor_id: null },
        { seq: '2', action: 'membership.create', actor_id: null },
      ]);
      const report = await withClinic(db.pool, clinic.clinicId, (client) =>
        verifyChain(client, clinic.clinicId)
      );
      expect(report).toEqual({ clinicId: clinic.clinicId, ok: true, checked: 2 });
    }
    const command = (
      await db.owner.query(
        `SELECT source, actor_id, status, risk_tier FROM voice.commands WHERE clinic_id = $1`,
        [a.clinicId]
      )
    ).rows;
    expect(command).toEqual([
      { source: 'system', actor_id: null, status: 'executed', risk_tier: 'R3' },
    ]);
  });

  it('lets the new administrator sign in with the one-time password, then enrol MFA', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'owner@thames.test', password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'mfa_enrollment_required' });
  });

  it('adds an existing account as administrator without changing its password', async () => {
    const before = (
      await db.owner.query(`SELECT password_hash FROM core.users WHERE email = 'owner@thames.test'`)
    ).rows[0].password_hash;
    const second = resultOf(
      await onboard({ ...london, name: 'Thames Dental North' }, 'Owner@Thames.test')
    );
    expect(second).toMatchObject({ adminUserId: a.adminUserId, adminCreated: false });
    const after = (
      await db.owner.query(`SELECT password_hash FROM core.users WHERE email = 'owner@thames.test'`)
    ).rows[0].password_hash;
    expect(after).toBe(before);

    // The owner of two clinics now chooses one at sign-in.
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'owner@thames.test', password: PASSWORD },
    });
    expect(response.json()).toMatchObject({ code: 'clinic_required' });
    expect(response.json().clinics).toHaveLength(2);
  });

  it('refuses a duplicate name in the same country, and allows it elsewhere', async () => {
    await expect(onboard(london, 'someone@thames.test')).rejects.toMatchObject({
      statusCode: 409,
      code: 'possible_duplicate',
    });
    const elsewhere = resultOf(
      await onboard({ ...london, country: 'IE', currency: 'EUR' }, 'x@ie.test')
    );
    expect(elsewhere.adminCreated).toBe(true);
  });

  it('refuses an unknown profile and invalid settings, and creates nothing', async () => {
    const clinicsBefore = (await db.owner.query('SELECT count(*)::int AS n FROM core.clinics'))
      .rows[0].n;
    await expect(
      onboard({ ...tehran, name: 'Profile Test', regulatoryProfile: 'none' }, 'p@x.test')
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      onboard({ ...tehran, name: 'Currency Test', currency: 'TOMAN' }, 'c@x.test')
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      onboard({ ...tehran, name: 'Notation Test', toothNotation: 'Universal' }, 'n@x.test')
    ).rejects.toMatchObject({ statusCode: 400 });
    expect((await db.owner.query('SELECT count(*)::int AS n FROM core.clinics')).rows[0].n).toBe(
      clinicsBefore
    );
    expect(
      (
        await db.owner.query(
          `SELECT count(*)::int AS n FROM core.users WHERE email LIKE '%@x.test'`
        )
      ).rows[0].n
    ).toBe(0);
  });

  it('refuses the command for an actor without platform.manage', async () => {
    await expect(
      bus.execute(
        { type: 'clinic.onboard', payload: {}, idempotencyKey: randomUUID(), source: 'gui' },
        { userId: a.adminUserId, clinicId: a.clinicId, permissions: ['admin.manage'] }
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('keeps settings well-formed in the database', async () => {
    const profile = (
      await db.owner.query(`SELECT id FROM core.regulatory_profiles WHERE key = 'standard'`)
    ).rows[0].id;
    await expect(
      db.owner.query(
        `INSERT INTO core.clinics (id, name, country, regulatory_profile_id, currency, timezone)
         VALUES ($1, 'Lowercase', 'gb', $2, 'gbp', 'Europe/London')`,
        [uuidv7(), profile]
      )
    ).rejects.toThrow(/clinics_country_check|clinics_currency_check/);
  });
});
