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

/** C1 acceptance: a misspelt name finds the patient, and every profile read is logged. */

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const alpha: Record<string, string> = {};
const beta: Record<string, string> = {};

beforeAll(async () => {
  db = await startTestDatabase();
  alpha.clinic = await createClinic(db.owner, 'Alpha Dental');
  for (const role of ['dentist', 'receptionist', 'assistant', 'researcher'] as const) {
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
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

async function as(role: SystemRole, clinic = alpha) {
  const token = await accessToken(tokens, {
    userId: clinic[role]!,
    clinicId: clinic.clinic!,
    role,
  });
  return { authorization: `Bearer ${token}` };
}

async function create(body: Record<string, unknown>, role: SystemRole = 'receptionist') {
  return app.inject({
    method: 'POST',
    url: '/v1/patients',
    payload: body,
    headers: { ...(await as(role)), 'idempotency-key': randomUUID() },
  });
}

async function search(q: string, role: SystemRole = 'dentist', clinic = alpha, extra = '') {
  return app.inject({
    method: 'GET',
    url: `/v1/patients?q=${encodeURIComponent(q)}${extra}`,
    headers: await as(role, clinic),
  });
}

const sara = {
  givenName: 'Sara',
  familyName: 'Ahmed',
  birthDate: '1990-04-12',
  sex: 'female',
  phone: '+44 7700 900123',
  nationalId: 'QQ 12 34 56 C',
};
const patients: Record<string, { id: string; fileNumber: number; version: number }> = {};

describe('registering patients', () => {
  it('creates a patient with a file number and keeps the national ID encrypted', async () => {
    const response = await create(sara);
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      fileNumber: 1,
      givenName: 'Sara',
      familyName: 'Ahmed',
      birthDate: '1990-04-12',
      // QQ123456C, normalised, with the last four characters showing.
      nationalId: '•••••456C',
      status: 'active',
      version: 1,
    });
    patients.sara = body;

    const stored = (
      await db.owner.query(
        'SELECT national_id_encrypted, national_id_index FROM clinical.patients WHERE id = $1',
        [body.id]
      )
    ).rows[0];
    expect(stored.national_id_encrypted).toMatch(/^v1\./);
    expect(stored.national_id_index).toMatch(/^[0-9a-f]{64}$/);

    // Neither the command log nor the audit trail holds the number in clear.
    const leaks = (
      await db.owner.query(
        `SELECT
           (SELECT count(*) FROM voice.commands WHERE payload::text ILIKE '%QQ%' OR payload::text LIKE '%123456%')
         + (SELECT count(*) FROM audit.audit_log WHERE after::text ILIKE '%QQ%' OR after::text LIKE '%123456%')
           AS n`
      )
    ).rows[0];
    expect(Number(leaks.n)).toBe(0);
    const audit = (
      await db.owner.query(`SELECT after FROM audit.audit_log WHERE entity_id = $1`, [body.id])
    ).rows[0];
    expect(audit.after).toMatchObject({ fileNumber: 1, nationalId: 'set' });
  });

  it('numbers patients in order, also under concurrent registration', async () => {
    const people = Array.from({ length: 8 }, (_, index) => ({
      givenName: `Person${index}`,
      familyName: `Batch${index}`,
      birthDate: `1980-01-${String(index + 1).padStart(2, '0')}`,
      sex: 'unknown',
    }));
    const responses = await Promise.all(people.map((person) => create(person)));
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);
    const numbers = responses.map((response) => response.json().fileNumber).sort((a, b) => a - b);
    expect(numbers).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('warns about a likely duplicate, and creates it when told to', async () => {
    const twin = { ...sara, givenName: 'Sarah', phone: undefined, nationalId: undefined };
    const warned = await create(twin);
    expect(warned.statusCode).toBe(409);
    expect(warned.json()).toMatchObject({
      code: 'possible_duplicate',
      candidates: [{ id: patients.sara!.id, fileNumber: 1, givenName: 'Sara' }],
    });

    const forced = await create({ ...twin, force: true });
    expect(forced.statusCode).toBe(201);
    const audit = (
      await db.owner.query(`SELECT after FROM audit.audit_log WHERE entity_id = $1`, [
        forced.json().id,
      ])
    ).rows[0];
    expect(audit.after.duplicatesOverridden).toEqual([patients.sara!.id]);
  });

  it('treats the same national ID as a duplicate whatever the name', async () => {
    const response = await create({
      givenName: 'Totally',
      familyName: 'Different',
      birthDate: '1975-06-01',
      sex: 'male',
      nationalId: 'qq123456c',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().candidates[0].id).toBe(patients.sara!.id);
  });

  it('validates the details', async () => {
    const response = await create({ ...sara, birthDate: '2999-01-01' });
    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0].path).toBe('birthDate');
  });
});

describe('finding patients', () => {
  beforeAll(async () => {
    for (const person of [
      {
        givenName: 'John',
        familyName: 'Smith',
        birthDate: '1985-02-02',
        sex: 'male',
        phone: '07911 123456',
      },
      { givenName: 'محمد', familyName: 'رضایی پور', birthDate: '1979-09-09', sex: 'male' },
      {
        givenName: 'Ana',
        familyName: 'Müller-Lüdenscheidt',
        birthDate: '1992-12-01',
        sex: 'female',
      },
    ]) {
      const response = await create(person);
      patients[person.givenName] = response.json();
    }
  });

  it.each([
    ['a misspelt name', 'Sarah Ahmad', 'Sara'],
    ['a misheard name', 'Jon Smyth', 'John'],
    ['the family name alone', 'smith', 'John'],
    ['a name without accents', 'ana muller', 'Ana'],
    ['part of a double surname', 'ludenscheidt', 'Ana'],
    ['an Arabic spelling of a Persian name', 'محمد رضائي‌پور', 'محمد'],
    ['part of the phone number', '123456', 'John'],
  ])('finds the patient from %s', async (_case, query, expected) => {
    const response = await search(query);
    expect(response.statusCode).toBe(200);
    const [first] = response.json().results;
    expect(first?.givenName).toBe(expected);
    expect(first.score).toBeGreaterThanOrEqual(0.3);
  });

  it('finds a patient by file number', async () => {
    const results = (await search(String(patients.John!.fileNumber))).json().results;
    expect(results[0].id).toBe(patients.John!.id);
  });

  it('returns nothing for an unrelated name and refuses a one-letter query', async () => {
    expect((await search('Xavier Quill')).json().results).toEqual([]);
    expect((await search('S')).statusCode).toBe(400);
  });

  it('records every search in the access log', async () => {
    const before = (
      await db.owner.query(
        `SELECT count(*)::int AS n FROM audit.access_log WHERE purpose = 'patient.search' AND actor_id = $1`,
        [alpha.dentist]
      )
    ).rows[0].n;
    await search('smith');
    const after = (
      await db.owner.query(
        `SELECT count(*)::int AS n FROM audit.access_log WHERE purpose = 'patient.search' AND actor_id = $1`,
        [alpha.dentist]
      )
    ).rows[0].n;
    expect(after).toBe(before + 1);
  });

  it('records every profile read', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/patients/${patients.sara!.id}`,
      headers: await as('assistant'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: patients.sara!.id, givenName: 'Sara' });
    const log = (
      await db.owner.query(`SELECT actor_id, purpose FROM audit.access_log WHERE patient_id = $1`, [
        patients.sara!.id,
      ])
    ).rows;
    expect(log).toContainEqual({ actor_id: alpha.assistant, purpose: 'patient.view' });
  });
});

describe('changing patients', () => {
  async function patch(
    id: string,
    body: Record<string, unknown>,
    role: SystemRole = 'receptionist'
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/v1/patients/${id}`,
      payload: body,
      headers: { ...(await as(role)), 'idempotency-key': randomUUID() },
    });
  }

  it('updates details with optimistic locking', async () => {
    const changed = await patch(patients.sara!.id, { version: 1, phone: '+44 7700 900999' });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ phone: '+44 7700 900999', version: 2 });
    const stale = await patch(patients.sara!.id, { version: 1, email: 'sara@example.com' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'version_conflict', currentVersion: 2 });
  });

  it('records a national ID change without the number', async () => {
    const response = await patch(patients.sara!.id, { version: 2, nationalId: 'ZZ 99 88 77 A' });
    expect(response.json().nationalId.endsWith('877A')).toBe(true);
    const audit = (
      await db.owner.query(
        `SELECT before, after FROM audit.audit_log WHERE entity_id = $1 ORDER BY seq DESC LIMIT 1`,
        [patients.sara!.id]
      )
    ).rows[0];
    expect(audit).toMatchObject({
      before: { nationalId: 'set' },
      after: { nationalId: 'changed' },
    });
    expect(JSON.stringify(audit)).not.toMatch(/ZZ|998877/);
  });

  it('archives a patient, hiding them from search unless asked', async () => {
    const john = patients.John!;
    const response = await patch(john.id, { version: john.version, status: 'archived' });
    expect(response.json().status).toBe('archived');
    expect(
      (await search('John Smith')).json().results.map((r: { id: string }) => r.id)
    ).not.toContain(john.id);
    const withArchived = await search('John Smith', 'dentist', alpha, '&includeArchived=true');
    expect(withArchived.json().results[0]).toMatchObject({ id: john.id, status: 'archived' });
    const action = (
      await db.owner.query(
        `SELECT action FROM audit.audit_log WHERE entity_id = $1 ORDER BY seq DESC LIMIT 1`,
        [john.id]
      )
    ).rows[0].action;
    expect(action).toBe('patient.archive');
  });
});

describe('access control', () => {
  it('lets an assistant read but not register patients', async () => {
    expect((await search('sara', 'assistant')).statusCode).toBe(200);
    expect((await create({ ...sara, givenName: 'Nope' }, 'assistant')).statusCode).toBe(403);
  });

  it('keeps researchers away from patient records', async () => {
    expect((await search('sara', 'researcher')).statusCode).toBe(403);
    const profile = await app.inject({
      method: 'GET',
      url: `/v1/patients/${patients.sara!.id}`,
      headers: await as('researcher'),
    });
    expect(profile.statusCode).toBe(403);
  });

  it('never shows one clinic the patients of another', async () => {
    expect((await search('Sara Ahmed', 'dentist', beta)).json().results).toEqual([]);
    const profile = await app.inject({
      method: 'GET',
      url: `/v1/patients/${patients.sara!.id}`,
      headers: await as('dentist', beta),
    });
    expect(profile.statusCode).toBe(404);
  });
});
