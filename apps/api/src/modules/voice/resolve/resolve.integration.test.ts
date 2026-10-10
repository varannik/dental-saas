import { randomUUID } from 'node:crypto';
import type { SystemRole } from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withClinic } from '../../../platform/db.js';
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
import { InterpreterRegistry } from '../interpreters.js';
import type { Interpreter, ModelReply } from '../types.js';
import { resolvePatient } from './patient.js';

/** V5 acceptance: "tooth sixteen" resolves by the clinic's notation. */

class ScriptedModel implements Interpreter {
  readonly provider = 'scripted';
  readonly model = 'script-1';
  readonly promptVersion = 0;
  next: ModelReply = { kind: 'text' };
  async call(): Promise<ModelReply> {
    return this.next;
  }
  async interpret(): Promise<never> {
    throw new Error('not used');
  }
}

let db: TestDatabase;
let app: FastifyInstance;
let tokens: TokenService;
const model = new ScriptedModel();
const fdi: Record<string, string> = {};
const universal: Record<string, string> = {};
let sara = '';
let session = '';
let planItems: { id: string; code: string }[] = [];

async function headers(role: SystemRole, clinic = fdi) {
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
  role: SystemRole = 'dentist',
  clinic = fdi
) => app.inject({ method: 'POST', url, payload, headers: await headers(role, clinic) });
const focus = async (body: Record<string, unknown>, clinic = fdi) =>
  app.inject({
    method: 'PUT',
    url: '/v1/voice/context/focus',
    payload: body,
    headers: await headers('dentist', clinic),
  });

/** What the scripted model "understood" from the words, resolved by the server. */
async function say(text: string, tool: string, entities: Record<string, string>, clinic = fdi) {
  model.next = { kind: 'tool', name: tool, input: { ...entities, confidence: 0.9 } };
  const response = await post('/v1/voice/interpret', { text }, 'dentist', clinic);
  expect(response.statusCode).toBe(200);
  return response.json().proposal;
}

beforeAll(async () => {
  db = await startTestDatabase();
  for (const [record, name] of [
    [fdi, 'FDI Dental'],
    [universal, 'Universal Dental'],
  ] as const) {
    record.clinic = await createClinic(db.owner, name);
    for (const role of ['dentist', 'receptionist'] as const) {
      record[role] = await createMember(db.owner, record.clinic, role);
    }
  }
  // Universal numbering is set on the clinic; the settings screen offers only FDI for now.
  await db.owner.query(`UPDATE core.clinics SET tooth_notation = 'Universal' WHERE id = $1`, [
    universal.clinic,
  ]);
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
    interpreters: new InterpreterRegistry({ anthropic: model }, 'anthropic'),
  });

  sara = (
    await post(
      '/v1/patients',
      { givenName: 'Sara', familyName: 'Resolve', birthDate: '1980-03-03', sex: 'female' },
      'receptionist'
    )
  ).json().id;
  await post(
    '/v1/patients',
    { givenName: 'Sarah', familyName: 'Resolve', birthDate: '1975-07-07', sex: 'female' },
    'receptionist'
  );
  const planId = (await post(`/v1/patients/${sara}/plans`, {})).json().id;
  await post(`/v1/plans/${planId}/items`, { procedureCode: 'root_canal_molar', tooth: '16' });
  await post(`/v1/plans/${planId}/items`, { procedureCode: 'scale_polish' });
  const plan = (await post(`/v1/plans/${planId}/accept`, {})).json();
  planItems = plan.items.map((item: { id: string; procedureType: { code: string } }) => ({
    id: item.id,
    code: item.procedureType.code,
  }));
  session = (await post('/v1/sessions', { patientId: sara })).json().id;
  await focus({ patientId: sara, sessionId: session, tooth: '16' });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('resolving by the clinic notation (V5 acceptance)', () => {
  it('reads "tooth sixteen" as FDI 16 in an FDI clinic', async () => {
    const proposal = await say('tooth sixteen occlusal caries', 'finding__add', {
      tooth: 'sixteen',
      finding: 'caries',
      surfaces: 'occlusal',
    });
    expect(proposal).toMatchObject({
      command: 'finding.add',
      payload: { sessionId: session, tooth: '16', code: 'caries', surfaces: ['O'] },
      missing: [],
      problems: [],
      ready: true,
    });
    expect(proposal.fields).toContainEqual({
      key: 'tooth',
      value: '16',
      resolvedFrom: 'speech',
      said: 'sixteen',
    });
  });

  it('reads "tooth sixteen" as Universal 16, the upper left third molar (FDI 28), in a Universal clinic', async () => {
    const patient = (
      await post(
        '/v1/patients',
        { givenName: 'Ula', familyName: 'Universal', birthDate: '1990-01-01', sex: 'female' },
        'receptionist',
        universal
      )
    ).json().id;
    const visit = (await post('/v1/sessions', { patientId: patient }, 'dentist', universal)).json()
      .id;
    await focus({ patientId: patient, sessionId: visit }, universal);
    const proposal = await say(
      'tooth sixteen occlusal caries',
      'finding__add',
      {
        tooth: 'sixteen',
        finding: 'caries',
        surfaces: 'occlusal',
      },
      universal
    );
    expect(proposal.payload).toMatchObject({ tooth: '28', surfaces: ['O'] });
    // Shown to the clinician in their own notation.
    expect(proposal.fields).toContainEqual({
      key: 'tooth',
      value: '16',
      resolvedFrom: 'speech',
      said: 'sixteen',
    });
    expect(proposal.ready).toBe(true);
  });
});

describe('resolving entities and context', () => {
  it('takes the tooth in focus when none was said, and labels it as from context', async () => {
    const proposal = await say('occlusal caries', 'finding__add', {
      finding: 'caries',
      surfaces: 'occlusal',
    });
    expect(proposal.payload).toMatchObject({ tooth: '16', code: 'caries' });
    expect(proposal.fields).toContainEqual({ key: 'tooth', value: '16', resolvedFrom: 'context' });
    expect(proposal.ready).toBe(true);
  });

  it('holds the resolved payload as the pending proposal', async () => {
    const context = (
      await app.inject({
        method: 'GET',
        url: '/v1/voice/context',
        headers: await headers('dentist'),
      })
    ).json();
    expect(context.pending).toMatchObject({
      type: 'finding.add',
      payload: { tooth: '16', code: 'caries', surfaces: ['O'] },
    });
  });

  it('asks for surfaces a surface finding needs, and refuses surfaces a tooth does not have', async () => {
    expect(await say('caries', 'finding__add', { finding: 'caries' })).toMatchObject({
      missing: ['surfaces'],
      ready: false,
    });
    expect(
      await say('incisal caries on sixteen', 'finding__add', {
        tooth: 'sixteen',
        finding: 'caries',
        surfaces: 'incisal',
      })
    ).toMatchObject({
      problems: ['Tooth 16 has no I surface.'],
      ready: false,
    });
  });

  it('starts the planned item when the words match one', async () => {
    const proposal = await say('start the root canal', 'procedure__start', {
      procedure: 'root canal',
    });
    const planned = planItems.find((item) => item.code === 'root_canal_molar')!;
    expect(proposal).toMatchObject({
      payload: { sessionId: session, planItemId: planned.id },
      ready: true,
    });
    expect(proposal.fields[0]).toMatchObject({ key: 'planItemId', resolvedFrom: 'speech' });
    expect(proposal.fields[0].value).toContain('(planned)');
  });

  it('starts an unplanned procedure from the catalog, on the tooth in focus', async () => {
    const proposal = await say('start a crown', 'procedure__start', { procedure: 'crown' });
    expect(proposal).toMatchObject({
      payload: { procedureCode: 'crown', tooth: '16' },
      ready: true,
    });
  });

  it('settles a shared name by the tooth, and asks when the words really are ambiguous', async () => {
    const rct = await say('start a root canal on twenty one', 'procedure__start', {
      procedure: 'root canal',
      tooth: 'twenty one',
    });
    expect(rct).toMatchObject({
      payload: { procedureCode: 'root_canal_anterior', tooth: '21' },
      ready: true,
    });
    const filling = await say('start a filling', 'procedure__start', { procedure: 'filling' });
    expect(filling.ready).toBe(false);
    expect(filling.alternatives[0].options.sort()).toEqual([
      'Amalgam filling',
      'Composite filling',
    ]);
  });

  it('places "a crown afterward" after the root canal on the tooth in focus', async () => {
    const proposal = await say('add a crown afterward', 'plan_item__add', {
      procedure: 'crown',
      position: 'afterward',
    });
    const rct = planItems.find((item) => item.code === 'root_canal_molar')!;
    expect(proposal).toMatchObject({
      payload: { procedureCode: 'crown', tooth: '16', afterItemId: rct.id },
      ready: true,
    });
    expect(proposal.fields).toContainEqual({ key: 'tooth', value: '16', resolvedFrom: 'context' });
  });

  it('reads probing depths and bleeding into measurements', async () => {
    const proposal = await say('sixteen three two four bleeding mesiobuccal', 'perio__record', {
      tooth: 'sixteen',
      readings: 'three two four',
      bleeding: 'mesiobuccal',
    });
    expect(proposal.payload.measurements).toEqual([
      { tooth: '16', site: 'MB', pocketDepth: 3, bleeding: true },
      { tooth: '16', site: 'B', pocketDepth: 2, bleeding: false },
      { tooth: '16', site: 'DB', pocketDepth: 4, bleeding: false },
    ]);
    expect(proposal.ready).toBe(true);
  });

  it('completes the procedure in progress', async () => {
    const started = await post(`/v1/sessions/${session}/procedures`, {
      procedureCode: 'examination',
    });
    const proposal = await say('complete it', 'procedure__complete', {});
    expect(proposal).toMatchObject({ payload: { procedureId: started.json().id }, ready: true });
    expect(proposal.fields[0]).toMatchObject({ resolvedFrom: 'context' });
  });

  it('records a diagnosis, mapping unknown ones to "other" with the words', async () => {
    expect(
      await say('diagnosis irreversible pulpitis on sixteen', 'diagnosis__record', {
        diagnosis: 'irreversible pulpitis',
        tooth: 'sixteen',
      })
    ).toMatchObject({
      payload: { code: 'irreversible_pulpitis', tooth: '16' },
      ready: true,
    });
    expect(await say('bruxism', 'diagnosis__record', { diagnosis: 'bruxism' })).toMatchObject({
      payload: { code: 'other', label: 'bruxism' },
      ready: true,
    });
  });

  it('adds an allergy to the history of the patient on screen', async () => {
    expect(
      await say('allergic to penicillin severe', 'history__add', {
        kind: 'allergy',
        name: 'penicillin',
        severity: 'severe',
      })
    ).toMatchObject({
      payload: { patientId: sara, kind: 'allergy', label: 'penicillin', severity: 'severe' },
      ready: true,
    });
  });

  it('says what stands in the way instead of guessing', async () => {
    expect(
      await say('add caries on nineteen', 'finding__add', {
        tooth: 'nineteen',
        finding: 'caries',
        surfaces: 'occlusal',
      })
    ).toMatchObject({
      problems: ['"nineteen" is not a tooth in FDI notation.'],
      ready: false,
    });
    await focus({ patientId: sara });
    expect(await say('complete the session', 'session__complete', {})).toMatchObject({
      problems: ['No session is open.'],
      ready: false,
    });
    await focus({ patientId: sara, sessionId: session, tooth: '16' });
  });
});

describe('patients by voice', () => {
  it('finds a patient by name, lists close matches, and takes "the second one" from the list', async () => {
    await withClinic(db.pool, fdi.clinic!, async (client) => {
      const several = await resolvePatient(client, 'Sara Resolve', { lastListed: null });
      expect(several.status).toBe('several');
      const ids = several.status === 'several' ? several.candidates.map((c) => c.id) : [];
      expect(ids).toContain(sara);
      const second = await resolvePatient(client, 'the second one', {
        lastListed: { kind: 'patients', ids },
      });
      expect(second).toMatchObject({ status: 'one', patient: { id: ids[1] } });
      expect(
        await resolvePatient(client, 'number nine', { lastListed: { kind: 'patients', ids } })
      ).toEqual({ status: 'none' });
      expect(await resolvePatient(client, 'Zebedee Nobody', { lastListed: null })).toEqual({
        status: 'none',
      });
    });
  });
});
