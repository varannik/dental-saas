import type { CommandDefinition } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withClinic } from '../../platform/db.js';
import { buildServer } from '../../server.js';
import {
  accessToken,
  createClinic,
  createMember,
  startTestDatabase,
  type TestDatabase,
} from '../../testing/database.js';
import { verifyChain } from '../audit/chain.js';
import { createDummyHash } from '../identity/passwords.js';
import { IdentityService } from '../identity/service.js';
import { ChallengeTokens, loadSigningKeys, TokenService } from '../identity/tokens.js';
import { SecretBox } from '../../platform/secret-box.js';
import type { CommandBus } from './bus.js';

/**
 * F6 acceptance: a retried command returns the first result, and the audit row commits with
 * the write or not at all. Runs against PostgreSQL as the application role.
 */

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
let bus: CommandBus;
const alpha = { clinicId: '', admin: '', dentist: '', manager: '' };
const beta = { clinicId: '', manager: '' };

// Test-only commands, to break the transaction on purpose and to append audit entries fast.
const breakAudit: CommandDefinition = {
  type: 'test.write_then_fail_audit',
  description: 'Renames the clinic, then reports an audit entry the database rejects.',
  permission: 'admin.manage',
  risk: 'R3',
  payload: z.object({ name: z.string() }),
};
const note: CommandDefinition = {
  type: 'test.note',
  description: 'Writes nothing; records one audit entry.',
  permission: 'admin.manage',
  risk: 'R0',
  payload: z.object({ text: z.string() }),
};

beforeAll(async () => {
  db = await startTestDatabase();
  alpha.clinicId = await createClinic(db.owner, 'Alpha Dental');
  alpha.admin = await createMember(db.owner, alpha.clinicId, 'admin');
  alpha.dentist = await createMember(db.owner, alpha.clinicId, 'dentist');
  alpha.manager = await createMember(db.owner, alpha.clinicId, 'manager');
  beta.clinicId = await createClinic(db.owner, 'Beta Dental');
  beta.manager = await createMember(db.owner, beta.clinicId, 'manager');

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
    onCommandBus: (commandBus) => {
      bus = commandBus;
      commandBus.register(breakAudit, async ({ client, actor }, payload) => {
        const { name } = payload as { name: string };
        await client.query('UPDATE core.clinics SET name = $2 WHERE id = $1', [
          actor.clinicId,
          name,
        ]);
        // entity is NOT NULL in audit.audit_log, so appending this entry fails.
        return {
          result: { renamed: true },
          audit: [
            {
              action: 'test',
              entity: null as unknown as string,
              entityId: 'x',
              before: null,
              after: null,
            },
          ],
        };
      });
      commandBus.register(note, async ({ actor }, payload) => ({
        result: { ok: true },
        audit: [
          {
            action: 'test.note',
            entity: 'note',
            entityId: actor.userId,
            before: null,
            after: payload,
          },
        ],
      }));
    },
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

const token = (userId: string, clinicId: string, role: 'admin' | 'dentist' | 'manager') =>
  accessToken(tokens, { userId, clinicId, role });

async function patchClinic(body: unknown, key: string | undefined, as = alpha.admin) {
  const role = as === alpha.dentist ? 'dentist' : 'admin';
  return app.inject({
    method: 'PATCH',
    url: '/v1/clinic',
    payload: body as Record<string, unknown>,
    headers: {
      authorization: `Bearer ${await token(as, alpha.clinicId, role)}`,
      ...(key ? { 'idempotency-key': key } : {}),
    },
  });
}

async function clinicRow(clinicId: string) {
  return (
    await db.owner.query<{ name: string; timezone: string; version: number }>(
      'SELECT name, timezone, version FROM core.clinics WHERE id = $1',
      [clinicId]
    )
  ).rows[0]!;
}

async function count(sql: string, params: unknown[]) {
  return (await db.owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, params))
    .rows[0]!.n;
}

describe('clinic.update_settings', () => {
  it('changes the settings and records the command and the audit entry', async () => {
    const response = await patchClinic(
      { version: 1, name: 'Alpha Dental Care', timezone: 'Europe/Dublin' },
      'rename-1'
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: 'Alpha Dental Care',
      timezone: 'Europe/Dublin',
      version: 2,
    });
    const commandId = response.headers['command-id'] as string;
    expect(commandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['idempotent-replayed']).toBeUndefined();

    const command = (
      await db.owner.query('SELECT * FROM voice.commands WHERE id = $1', [commandId])
    ).rows[0];
    expect(command).toMatchObject({
      type: 'clinic.update_settings',
      status: 'executed',
      source: 'gui',
      risk_tier: 'R3',
      actor_id: alpha.admin,
    });

    const audit = (
      await db.owner.query('SELECT * FROM audit.audit_log WHERE command_id = $1', [commandId])
    ).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'clinic.update_settings',
      entity: 'clinic',
      entity_id: alpha.clinicId,
      actor_id: alpha.admin,
      before: { name: 'Alpha Dental', timezone: 'Europe/London', version: 1 },
      after: { name: 'Alpha Dental Care', timezone: 'Europe/Dublin', version: 2 },
    });
  });

  it('returns the first result for a retry and applies the change once', async () => {
    const versionBefore = (await clinicRow(alpha.clinicId)).version;
    const body = { version: versionBefore, name: 'Alpha Smiles' };
    const first = await patchClinic(body, 'retry-1');
    const second = await patchClinic(body, 'retry-1');

    expect(second.statusCode).toBe(200);
    expect(second.body).toBe(first.body);
    expect(second.headers['command-id']).toBe(first.headers['command-id']);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect((await clinicRow(alpha.clinicId)).version).toBe(versionBefore + 1);
    expect(
      await count('audit.audit_log WHERE command_id = $1', [first.headers['command-id']])
    ).toBe(1);
  });

  it('refuses to reuse a key for a different request', async () => {
    const { version } = await clinicRow(alpha.clinicId);
    await patchClinic({ version, name: 'Key Owner' }, 'reuse-1');
    const other = await patchClinic({ version: version + 1, name: 'Someone Else' }, 'reuse-1');
    expect(other.statusCode).toBe(422);
    expect(other.json()).toMatchObject({ code: 'idempotency_key_reused' });
  });

  it('requires an Idempotency-Key', async () => {
    const response = await patchClinic({ version: 1, name: 'x' }, undefined);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_failed' });
  });

  it('rejects a stale version, writes nothing, and replays the refusal', async () => {
    const before = await clinicRow(alpha.clinicId);
    const auditBefore = await count('audit.audit_log WHERE clinic_id = $1', [alpha.clinicId]);
    const stale = await patchClinic({ version: 1, name: 'Stale' }, 'stale-1');
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      code: 'version_conflict',
      currentVersion: before.version,
    });
    const again = await patchClinic({ version: 1, name: 'Stale' }, 'stale-1');
    expect(again.statusCode).toBe(409);

    expect(await clinicRow(alpha.clinicId)).toEqual(before);
    expect(await count('audit.audit_log WHERE clinic_id = $1', [alpha.clinicId])).toBe(auditBefore);
    const refused = (
      await db.owner.query(
        `SELECT status, error FROM voice.commands WHERE idempotency_key = 'stale-1'`
      )
    ).rows;
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ status: 'failed', error: { code: 'version_conflict' } });
  });

  it('refuses a role without the permission and stores nothing', async () => {
    const response = await patchClinic({ version: 1, name: 'Dentist' }, 'denied-1', alpha.dentist);
    expect(response.statusCode).toBe(403);
    expect(await count(`voice.commands WHERE idempotency_key = 'denied-1'`, [])).toBe(0);
  });

  it('validates the payload against the registry', async () => {
    const response = await patchClinic({ version: 1, timezone: 'Mars/Olympus' }, 'bad-1');
    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0]).toMatchObject({ path: 'timezone' });
  });

  it('makes no change and no audit entry when nothing differs', async () => {
    const current = await clinicRow(alpha.clinicId);
    const response = await patchClinic({ version: current.version, name: current.name }, 'same-1');
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe(current.version);
    expect(
      await count('audit.audit_log WHERE command_id = $1', [response.headers['command-id']])
    ).toBe(0);
  });
});

describe('atomicity', () => {
  it('rolls back the write when the audit entry cannot be written', async () => {
    const before = await clinicRow(alpha.clinicId);
    await expect(
      bus.execute(
        {
          type: breakAudit.type,
          payload: { name: 'Never Saved' },
          idempotencyKey: 'atomic-1',
          source: 'system',
        },
        { userId: alpha.admin, clinicId: alpha.clinicId, permissions: ['admin.manage'] }
      )
    ).rejects.toThrow(/null value in column "entity"/);
    expect(await clinicRow(alpha.clinicId)).toEqual(before);
    // An unexpected failure is not stored, so the same key can be retried.
    expect(await count(`voice.commands WHERE idempotency_key = 'atomic-1'`, [])).toBe(0);
  });
});

describe('concurrency', () => {
  const actor = () => ({
    userId: alpha.admin,
    clinicId: alpha.clinicId,
    permissions: ['admin.manage'],
  });

  it('executes one command for concurrent requests with the same key', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        bus.execute(
          { type: note.type, payload: { text: 'once' }, idempotencyKey: 'race-1', source: 'gui' },
          actor()
        )
      )
    );
    expect(new Set(results.map((result) => result.commandId)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(await count(`voice.commands WHERE idempotency_key = 'race-1'`, [])).toBe(1);
    expect(await count('audit.audit_log WHERE command_id = $1', [results[0]!.commandId])).toBe(1);
  });

  it('keeps one unbroken chain under concurrent commands', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        bus.execute(
          {
            type: note.type,
            payload: { text: `note ${index}` },
            idempotencyKey: `parallel-${index}`,
            source: 'gui',
          },
          actor()
        )
      )
    );
    const report = await withClinic(db.pool, alpha.clinicId, (client) =>
      verifyChain(client, alpha.clinicId)
    );
    expect(report.ok).toBe(true);
    const seqs = (
      await db.owner.query<{ seq: string }>(
        'SELECT seq FROM audit.audit_log WHERE clinic_id = $1 ORDER BY seq',
        [alpha.clinicId]
      )
    ).rows.map((row) => Number(row.seq));
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, index) => index + 1));
  });
});

describe('audit trail', () => {
  it('is insert-only, also for the owner', async () => {
    await expect(
      withClinic(db.pool, alpha.clinicId, (client) =>
        client.query(`UPDATE audit.audit_log SET action = 'x'`)
      )
    ).rejects.toThrow(/permission denied/);
    await expect(db.owner.query(`DELETE FROM audit.audit_log`)).rejects.toThrow(/insert-only/);
    await expect(db.owner.query(`UPDATE voice.commands SET status = 'undone'`)).rejects.toThrow(
      /insert-only/
    );
  });

  it('detects an edited entry', async () => {
    const clinicId = await createClinic(db.owner, 'Tamper Dental');
    const admin = await createMember(db.owner, clinicId, 'admin');
    for (const key of ['t-1', 't-2', 't-3']) {
      await bus.execute(
        { type: note.type, payload: { text: key }, idempotencyKey: key, source: 'gui' },
        { userId: admin, clinicId, permissions: ['admin.manage'] }
      );
    }
    const intact = await withClinic(db.pool, clinicId, (client) => verifyChain(client, clinicId));
    expect(intact).toEqual({ clinicId, ok: true, checked: 3 });

    // Someone with database access bypasses the trigger and rewrites history.
    await db.owner.query(`SET session_replication_role = replica`);
    await db.owner.query(
      `UPDATE audit.audit_log SET after = '{"text":"forged"}' WHERE clinic_id = $1 AND seq = 2`,
      [clinicId]
    );
    await db.owner.query(`SET session_replication_role = origin`);

    const report = await withClinic(db.pool, clinicId, (client) => verifyChain(client, clinicId));
    expect(report).toMatchObject({
      ok: false,
      brokenAt: 2,
      reason: 'content does not match its hash',
    });
  });

  it('serves the trail to roles with audit.read, per clinic, and logs the read', async () => {
    const read = async (userId: string, clinicId: string, query = '') =>
      app.inject({
        method: 'GET',
        url: `/v1/audit${query}`,
        headers: { authorization: `Bearer ${await token(userId, clinicId, 'manager')}` },
      });

    const alphaPage = await read(alpha.manager, alpha.clinicId, '?entity=clinic&limit=2');
    expect(alphaPage.statusCode).toBe(200);
    const body = alphaPage.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0]).toMatchObject({ entity: 'clinic', entityId: alpha.clinicId });
    expect(body.entries[0].seq).toBeGreaterThan(body.entries[1].seq);
    expect(body.nextBefore).toBe(body.entries[1].seq);

    const betaPage = await read(beta.manager, beta.clinicId);
    expect(betaPage.json().entries).toEqual([]);

    expect(
      await count(`audit.access_log WHERE actor_id = $1 AND purpose = 'audit.read'`, [
        alpha.manager,
      ])
    ).toBe(1);

    const dentist = await app.inject({
      method: 'GET',
      url: '/v1/audit',
      headers: { authorization: `Bearer ${await token(alpha.dentist, alpha.clinicId, 'dentist')}` },
    });
    expect(dentist.statusCode).toBe(403);
  });
});
