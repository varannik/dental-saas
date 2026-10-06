import { randomUUID } from 'node:crypto';
import {
  FINDING_CODES,
  FINDINGS,
  PERMANENT_TEETH,
  surfacesOf,
  type SystemRole,
} from '@dental/contracts';
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
import { chartFromEvents, readChart, rebuildChart } from './chart.js';

/** C3 acceptance: chart state rebuilds from events. */

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

async function post(
  url: string,
  payload: Record<string, unknown> = {},
  role: SystemRole = 'dentist'
) {
  return app.inject({ method: 'POST', url, payload, headers: await headers(role) });
}

async function get(url: string, role: SystemRole = 'dentist', clinic = alpha) {
  return app.inject({ method: 'GET', url, headers: await headers(role, clinic) });
}

async function newPatient(givenName: string): Promise<string> {
  const response = await post(
    '/v1/patients',
    { givenName, familyName: 'Chart', birthDate: '1985-01-01', sex: 'female' },
    'receptionist'
  );
  return response.json().id;
}

const chartOf = async (patientId: string) =>
  (await get(`/v1/patients/${patientId}/chart`)).json().entries as {
    tooth: string;
    surface: string | null;
    state: string;
  }[];

const places = (entries: { tooth: string; surface: string | null; state: string }[]) =>
  entries.map(
    (entry) => `${entry.tooth}${entry.surface ? `:${entry.surface}` : ''}=${entry.state}`
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
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('a session', () => {
  let patientId = '';
  let sessionId = '';

  it('opens once per patient', async () => {
    patientId = await newPatient('Nora');
    const started = await post('/v1/sessions', { patientId, chiefComplaint: 'Pain upper right' });
    expect(started.statusCode).toBe(201);
    expect(started.json()).toMatchObject({
      patientId,
      status: 'open',
      chiefComplaint: 'Pain upper right',
      providerId: alpha.dentist,
      endedAt: null,
    });
    sessionId = started.json().id;

    const again = await post('/v1/sessions', { patientId });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'session_open', sessionId });
  });

  it('records findings on surfaces and whole teeth, and keeps the chart current', async () => {
    const caries = await post(`/v1/sessions/${sessionId}/findings`, {
      tooth: '16',
      surfaces: ['O', 'M'],
      code: 'caries',
      note: 'Deep',
    });
    expect(caries.statusCode).toBe(201);
    expect(caries.json().findings).toHaveLength(2);
    expect(places(caries.json().chart)).toEqual(['16:M=caries', '16:O=caries']);

    const restored = await post(`/v1/sessions/${sessionId}/findings`, {
      tooth: '16',
      surfaces: ['O'],
      code: 'restoration',
      value: 'composite',
      supersedesId: caries.json().findings[0].id,
    });
    expect(restored.json().findings[0].supersedesId).toBe(caries.json().findings[0].id);

    await post(`/v1/sessions/${sessionId}/findings`, { tooth: '18', code: 'missing' });
    await post(`/v1/sessions/${sessionId}/findings`, { tooth: '26', code: 'crown' });
    expect(places(await chartOf(patientId))).toEqual([
      '16:M=caries',
      '16:O=restoration',
      '18=missing',
      '26=crown',
    ]);

    // A whole-tooth "sound" clears the tooth and every surface on it.
    await post(`/v1/sessions/${sessionId}/findings`, { tooth: '16', code: 'sound' });
    expect(places(await chartOf(patientId))).toEqual(['18=missing', '26=crown']);
  });

  it('validates teeth, surfaces and corrections', async () => {
    const send = (body: Record<string, unknown>) =>
      post(`/v1/sessions/${sessionId}/findings`, body);
    expect((await send({ tooth: '16', code: 'caries' })).statusCode).toBe(400);
    expect((await send({ tooth: '11', surfaces: ['O'], code: 'caries' })).statusCode).toBe(400);
    expect((await send({ tooth: '19', code: 'missing' })).statusCode).toBe(400);
    expect((await send({ tooth: '36', surfaces: ['M'], code: 'crown' })).statusCode).toBe(400);
    const otherTooth = (await send({ tooth: '36', surfaces: ['M'], code: 'caries' })).json()
      .findings[0].id;
    const wrong = await send({
      tooth: '46',
      surfaces: ['M'],
      code: 'caries',
      supersedesId: otherTooth,
    });
    expect(wrong.statusCode).toBe(422);
  });

  it('records periodontal readings, keeping the latest per site', async () => {
    const sites = ['MB', 'B', 'DB', 'ML', 'L', 'DL'].map((site, index) => ({
      tooth: '16',
      site,
      pocketDepth: 3 + (index % 2),
      bleeding: index === 0,
    }));
    expect(
      (await post(`/v1/sessions/${sessionId}/perio`, { measurements: sites })).statusCode
    ).toBe(201);
    await post(`/v1/sessions/${sessionId}/perio`, {
      measurements: [{ tooth: '16', site: 'MB', pocketDepth: 6, bleeding: true, recession: 1 }],
    });
    const detail = (await get(`/v1/sessions/${sessionId}`)).json();
    expect(detail.perio).toHaveLength(6);
    expect(detail.perio.find((m: { site: string }) => m.site === 'MB')).toMatchObject({
      pocketDepth: 6,
      bleeding: true,
      recession: 1,
    });

    const repeated = await post(`/v1/sessions/${sessionId}/perio`, {
      measurements: [
        { tooth: '16', site: 'B', pocketDepth: 2 },
        { tooth: '16', site: 'B', pocketDepth: 3 },
      ],
    });
    expect(repeated.statusCode).toBe(400);
    const tooDeep = await post(`/v1/sessions/${sessionId}/perio`, {
      measurements: [{ tooth: '16', site: 'B', pocketDepth: 25 }],
    });
    expect(tooDeep.statusCode).toBe(400);
  });

  it('adds notes and returns the whole session', async () => {
    const note = await post(`/v1/sessions/${sessionId}/notes`, { body: 'Patient anxious.' });
    expect(note.statusCode).toBe(201);
    expect(note.json()).toMatchObject({ type: 'clinical', body: 'Patient anxious.' });
    const detail = (await get(`/v1/sessions/${sessionId}`)).json();
    expect(detail).toMatchObject({ id: sessionId, status: 'open' });
    expect(detail.findings.length).toBeGreaterThanOrEqual(7);
    expect(detail.notes.map((n: { body: string }) => n.body)).toEqual(['Patient anxious.']);
  });

  it('completes, then takes no more records, and the chart carries over', async () => {
    const done = await post(`/v1/sessions/${sessionId}/complete`);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'completed' });
    expect(done.json().endedAt).not.toBeNull();

    const late = await post(`/v1/sessions/${sessionId}/findings`, { tooth: '17', code: 'missing' });
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe('session_closed');

    const next = await post('/v1/sessions', { patientId });
    expect(next.statusCode).toBe(201);
    await post(`/v1/sessions/${next.json().id}/findings`, { tooth: '17', code: 'implant' });
    expect(places(await chartOf(patientId))).toEqual([
      '17=implant',
      '18=missing',
      '26=crown',
      '36:M=caries',
    ]);
    const sessions = (await get(`/v1/patients/${patientId}/sessions`)).json().sessions;
    expect(sessions.map((s: { status: string }) => s.status)).toEqual(['open', 'completed']);
  });

  it('returns the chart with its full event history', async () => {
    const chart = (await get(`/v1/patients/${patientId}/chart?history=true`)).json();
    expect(chart.events.length).toBeGreaterThan(chart.entries.length);
    expect(chart.events[0]).toMatchObject({ tooth: '16', surface: 'O', state: 'caries' });
  });
});

describe('the chart rebuilds from events', () => {
  it('derives the same chart from the events alone after many findings', async () => {
    const patientId = await newPatient('Replay');
    const sessionId = (await post('/v1/sessions', { patientId })).json().id;

    // A deterministic mix of findings over a few teeth, so places are overwritten and cleared.
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const teeth = [...PERMANENT_TEETH.upper.slice(0, 4), '11', '36'];
    for (let i = 0; i < 60; i++) {
      const tooth = teeth[random(teeth.length)]!;
      const code = FINDING_CODES[random(FINDING_CODES.length)]!;
      const scope = FINDINGS[code].scope;
      const surfaces = surfacesOf(tooth);
      const onSurfaces = scope === 'surface' || (scope === 'either' && random(2) === 0);
      const body: Record<string, unknown> = { tooth, code };
      if (onSurfaces) body.surfaces = [surfaces[random(surfaces.length)]];
      const response = await post(`/v1/sessions/${sessionId}/findings`, body);
      expect(response.statusCode).toBe(201);
    }

    const { live, derived } = await withClinic(db.pool, alpha.clinic!, async (client) => ({
      live: await readChart(client, patientId),
      derived: await chartFromEvents(client, patientId),
    }));
    expect(live.length).toBeGreaterThan(0);
    expect(derived).toEqual(live);

    // Lose the projection entirely, then rebuild it from the events.
    await db.owner.query('DELETE FROM clinical.chart_entries WHERE patient_id = $1', [patientId]);
    expect(await chartOf(patientId)).toEqual([]);
    await withClinic(db.pool, alpha.clinic!, (client) =>
      rebuildChart(client, alpha.clinic!, patientId)
    );
    const rebuilt = await withClinic(db.pool, alpha.clinic!, (client) =>
      readChart(client, patientId)
    );
    expect(rebuilt).toEqual(live);
  });
});

describe('records are insert-only', () => {
  it('rejects changing findings, events or notes, and moving a session backwards', async () => {
    for (const table of ['findings', 'chart_events', 'clinical_notes', 'perio_measurements']) {
      await expect(db.owner.query(`DELETE FROM clinical.${table}`)).rejects.toThrow(/insert-only/);
    }
    await expect(
      db.owner.query(
        `UPDATE clinical.clinical_sessions SET status = 'open', ended_at = NULL
         WHERE status = 'completed'`
      )
    ).rejects.toThrow(/open to completed to signed/);
  });
});

describe('access', () => {
  it('lets an assistant examine but keeps receptionists out of clinical content', async () => {
    const patientId = await newPatient('Access');
    const started = await post('/v1/sessions', { patientId }, 'assistant');
    expect(started.statusCode).toBe(201);
    const finding = await post(
      `/v1/sessions/${started.json().id}/findings`,
      { tooth: '21', surfaces: ['I'], code: 'fracture' },
      'assistant'
    );
    expect(finding.statusCode).toBe(201);

    expect((await get(`/v1/patients/${patientId}/chart`, 'receptionist')).statusCode).toBe(403);
    expect((await get(`/v1/sessions/${started.json().id}`, 'receptionist')).statusCode).toBe(403);
    expect(
      (await post('/v1/sessions', { patientId: randomUUID() }, 'receptionist')).statusCode
    ).toBe(403);
  });

  it('records chart and session reads, and isolates clinics', async () => {
    const reads = (
      await db.owner.query(
        `SELECT purpose, count(*)::int AS n FROM audit.access_log
         WHERE purpose IN ('patient.chart', 'session.view', 'patient.sessions')
         GROUP BY purpose ORDER BY purpose`
      )
    ).rows;
    expect(reads.map((row) => row.purpose)).toEqual([
      'patient.chart',
      'patient.sessions',
      'session.view',
    ]);

    const patientId = await newPatient('Isolated');
    const sessionId = (await post('/v1/sessions', { patientId })).json().id;
    expect((await get(`/v1/sessions/${sessionId}`, 'dentist', beta)).statusCode).toBe(404);
    expect((await get(`/v1/patients/${patientId}/chart`, 'dentist', beta)).statusCode).toBe(404);
  });
});
