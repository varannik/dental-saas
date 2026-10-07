import {
  findingAdd,
  noteAdd,
  perioRecord,
  sessionComplete,
  sessionStart,
  type PatientChart,
  type SessionDetail,
} from '@dental/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../platform/auth.js';
import { withClinic, type Pool, type PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import { recordAccess } from '../audit/chain.js';
import type { CommandBus } from '../commands/bus.js';
import { actorFrom, idempotencyKey, sendOutcome } from '../commands/http.js';
import type { TokenService } from '../identity/tokens.js';
import { DIAGNOSIS_COLUMNS, toDiagnosis, type DiagnosisRow } from '../diagnoses/commands.js';
import { sessionAmendments, sessionProcedures } from '../procedures/commands.js';
import { readChart } from './chart.js';
import {
  FINDING_COLUMNS,
  NOTE_COLUMNS,
  SESSION_COLUMNS,
  toChartEntry,
  toChartEvent,
  toFinding,
  toNote,
  toPerio,
  toSession,
  type ChartEventRow,
  type FindingRow,
  type NoteRow,
  type PerioRow,
  type SessionRow,
} from './model.js';

/**
 * Sessions, examination and the chart (C3). Reads need patient.read and session.read, as all
 * clinical content does (ADR 0002), and each is recorded in the access log.
 *
 *   GET  /v1/patients/:id/sessions     GET  /v1/sessions/:id      GET /v1/patients/:id/chart
 *   POST /v1/sessions                  POST /v1/sessions/:id/complete
 *   POST /v1/sessions/:id/findings     POST /v1/sessions/:id/perio
 *   POST /v1/sessions/:id/notes
 */

const idParams = z.object({ id: z.string().uuid() });
const chartQuery = z.object({ history: z.stringbool().default(false) });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpProblem(400, 'validation_failed', 'The request is not valid.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

const bodyOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

export async function registerSessionRoutes(
  app: FastifyInstance,
  options: { pool: Pool; bus: CommandBus; tokens: TokenService }
) {
  const { pool, bus, tokens } = options;
  const signedIn = authenticate(tokens);
  const clinicalRead = [
    signedIn,
    requirePermission('patient.read'),
    requirePermission('session.read'),
  ];

  async function patientExists(client: PoolClient, id: string) {
    const found = await client.query('SELECT 1 FROM clinical.patients WHERE id = $1', [id]);
    if (!found.rowCount) throw new HttpProblem(404, 'not_found', 'Patient not found.');
  }

  app.get('/v1/patients/:id/sessions', { preHandler: clinicalRead }, async (request) => {
    const { id } = parse(idParams, request.params);
    const auth = request.auth!;
    return withClinic(pool, auth.clinicId, async (client) => {
      await patientExists(client, id);
      await recordAccess(client, {
        clinicId: auth.clinicId,
        actorId: auth.userId,
        patientId: id,
        purpose: 'patient.sessions',
        requestId: request.id,
      });
      const { rows } = await client.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM clinical.clinical_sessions
         WHERE patient_id = $1 ORDER BY started_at DESC`,
        [id]
      );
      return { sessions: rows.map(toSession) };
    });
  });

  app.get(
    '/v1/sessions/:id',
    { preHandler: clinicalRead },
    async (request): Promise<SessionDetail> => {
      const { id } = parse(idParams, request.params);
      const auth = request.auth!;
      return withClinic(pool, auth.clinicId, async (client) => {
        const session = (
          await client.query<SessionRow>(
            `SELECT ${SESSION_COLUMNS} FROM clinical.clinical_sessions WHERE id = $1`,
            [id]
          )
        ).rows[0];
        if (!session) throw new HttpProblem(404, 'not_found', 'Session not found.');
        await recordAccess(client, {
          clinicId: auth.clinicId,
          actorId: auth.userId,
          patientId: session.patient_id,
          purpose: 'session.view',
          requestId: request.id,
        });
        const findings = await client.query<FindingRow>(
          `SELECT ${FINDING_COLUMNS} FROM clinical.findings WHERE session_id = $1
           ORDER BY recorded_at, id`,
          [id]
        );
        // The latest reading per tooth and site within this session.
        const perio = await client.query<PerioRow>(
          `SELECT DISTINCT ON (tooth, site) tooth, site, pocket_depth, bleeding, recession, recorded_at
           FROM clinical.perio_measurements WHERE session_id = $1
           ORDER BY tooth, site, recorded_at DESC, id DESC`,
          [id]
        );
        const diagnoses = await client.query<DiagnosisRow>(
          `SELECT ${DIAGNOSIS_COLUMNS} FROM clinical.diagnoses WHERE session_id = $1
           ORDER BY suggested_at, id`,
          [id]
        );
        const notes = await client.query<NoteRow>(
          `SELECT ${NOTE_COLUMNS} FROM clinical.clinical_notes
           WHERE session_id = $1 ORDER BY recorded_at, id`,
          [id]
        );
        return {
          ...toSession(session),
          findings: findings.rows.map(toFinding),
          diagnoses: diagnoses.rows.map(toDiagnosis),
          procedures: await sessionProcedures(client, id),
          amendments: await sessionAmendments(client, id),
          perio: perio.rows.map(toPerio),
          notes: notes.rows.map(toNote),
        };
      });
    }
  );

  app.get(
    '/v1/patients/:id/chart',
    { preHandler: clinicalRead },
    async (request): Promise<PatientChart> => {
      const { id } = parse(idParams, request.params);
      const { history } = parse(chartQuery, request.query);
      const auth = request.auth!;
      return withClinic(pool, auth.clinicId, async (client) => {
        await patientExists(client, id);
        await recordAccess(client, {
          clinicId: auth.clinicId,
          actorId: auth.userId,
          patientId: id,
          purpose: 'patient.chart',
          requestId: request.id,
        });
        const entries = (await readChart(client, id)).map(toChartEntry);
        if (!history) return { entries };
        const { rows } = await client.query<ChartEventRow>(
          `SELECT id, tooth, surface, state, finding_id, session_id, recorded_at
           FROM clinical.chart_events WHERE patient_id = $1 ORDER BY seq`,
          [id]
        );
        return { entries, events: rows.map(toChartEvent) };
      });
    }
  );

  /** A route that only translates the request into a command (spec section G). */
  const command =
    (
      type: string,
      status: number,
      payloadOf: (request: FastifyRequest) => Record<string, unknown>
    ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const outcome = await bus.execute(
        {
          type,
          payload: payloadOf(request),
          idempotencyKey: idempotencyKey(request),
          source: 'gui',
        },
        actorFrom(request)
      );
      reply.status(status);
      return sendOutcome(reply, outcome);
    };

  const withSession = (request: FastifyRequest) => ({
    ...bodyOf(request.body),
    sessionId: parse(idParams, request.params).id,
  });

  app.post(
    '/v1/sessions',
    { preHandler: signedIn },
    command(sessionStart.type, 201, (request) => bodyOf(request.body))
  );
  app.post(
    '/v1/sessions/:id/complete',
    { preHandler: signedIn },
    command(sessionComplete.type, 200, (request) => ({
      sessionId: parse(idParams, request.params).id,
    }))
  );
  app.post(
    '/v1/sessions/:id/findings',
    { preHandler: signedIn },
    command(findingAdd.type, 201, withSession)
  );
  app.post(
    '/v1/sessions/:id/perio',
    { preHandler: signedIn },
    command(perioRecord.type, 201, withSession)
  );
  app.post(
    '/v1/sessions/:id/notes',
    { preHandler: signedIn },
    command(noteAdd.type, 201, withSession)
  );
}
