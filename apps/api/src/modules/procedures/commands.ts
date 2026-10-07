import {
  AMENDMENT_ACTIONS,
  procedureCancel,
  procedureComplete,
  procedureStart,
  sessionAmend,
  sessionSign,
  type ClinicalSession,
  type FindingCode,
  type Procedure,
  type ProcedureDecision,
  type ProcedureStart,
  type SessionAmend,
  type SessionAmendment,
  type SessionSign,
  type Surface,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import type { PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { AuditChange } from '../audit/chain.js';
import type { CommandBus, HandlerContext, HandlerOutcome } from '../commands/bus.js';
import { recordChartEvent } from '../sessions/chart.js';
import { openSession, SESSION_COLUMNS, toSession, type SessionRow } from '../sessions/model.js';

/**
 * Procedures, sign-off and amendments (C6). Completing a procedure marks its plan item done and
 * records what it changed on the chart. Signing makes the session immutable; the database
 * refuses every later write to it unless the row belongs to an amendment of that session.
 */

/** What a completed procedure leaves on the chart. */
const CHART_RESULT: Record<string, FindingCode> = {
  composite_filling: 'restoration',
  amalgam_filling: 'restoration',
  glass_ionomer_filling: 'restoration',
  inlay_onlay: 'restoration',
  crown: 'crown',
  implant_crown: 'crown',
  root_canal_anterior: 'root_canal_treated',
  root_canal_premolar: 'root_canal_treated',
  root_canal_molar: 'root_canal_treated',
  extraction_simple: 'missing',
  extraction_surgical: 'missing',
  implant_placement: 'implant',
};

interface ProcedureRow {
  id: string;
  session_id: string;
  patient_id: string;
  plan_item_id: string | null;
  procedure_type_id: string;
  procedure_code: string;
  procedure_name: string;
  tooth: string | null;
  surfaces: Surface[];
  status: Procedure['status'];
  note: string | null;
  started_at: Date;
  started_by: string | null;
  ended_at: Date | null;
  ended_by: string | null;
  cancel_reason: string | null;
}

const PROCEDURE_SELECT = `
  SELECT p.id, p.session_id, p.patient_id, p.plan_item_id, p.procedure_type_id,
         t.code AS procedure_code, t.name AS procedure_name, p.tooth, p.surfaces, p.status,
         p.note, p.started_at, p.started_by, p.ended_at, p.ended_by, p.cancel_reason
  FROM clinical.procedures AS p
  JOIN catalog.procedure_types AS t ON t.id = p.procedure_type_id`;

export function toProcedure(row: ProcedureRow): Procedure {
  return {
    id: row.id,
    sessionId: row.session_id,
    planItemId: row.plan_item_id,
    procedureType: {
      id: row.procedure_type_id,
      code: row.procedure_code,
      name: row.procedure_name,
    },
    tooth: row.tooth,
    surfaces: row.surfaces,
    status: row.status,
    note: row.note,
    startedAt: row.started_at.toISOString(),
    startedBy: row.started_by,
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    endedBy: row.ended_by,
    cancelReason: row.cancel_reason,
  };
}

export async function sessionProcedures(
  client: PoolClient,
  sessionId: string
): Promise<Procedure[]> {
  const { rows } = await client.query<ProcedureRow>(
    `${PROCEDURE_SELECT} WHERE p.session_id = $1 ORDER BY p.started_at, p.id`,
    [sessionId]
  );
  return rows.map(toProcedure);
}

export async function sessionAmendments(
  client: PoolClient,
  sessionId: string
): Promise<SessionAmendment[]> {
  const { rows } = await client.query<{
    id: string;
    reason: string;
    amended_at: Date;
    amended_by: string | null;
  }>(
    `SELECT id, reason, amended_at, amended_by FROM clinical.session_amendments
     WHERE session_id = $1 ORDER BY amended_at, id`,
    [sessionId]
  );
  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    amendedAt: row.amended_at.toISOString(),
    amendedBy: row.amended_by,
  }));
}

async function loadProcedure(client: PoolClient, id: string): Promise<ProcedureRow> {
  const row = (await client.query<ProcedureRow>(`${PROCEDURE_SELECT} WHERE p.id = $1`, [id]))
    .rows[0];
  if (!row) throw new HttpProblem(404, 'not_found', 'Procedure not found.');
  return row;
}

export async function startProcedure(
  { client, actor }: HandlerContext,
  payload: ProcedureStart
): Promise<HandlerOutcome<Procedure>> {
  const session = await openSession(client, payload.sessionId);

  let procedureTypeId: string;
  let tooth: string | null;
  let surfaces: string[];
  if (payload.planItemId) {
    const item = (
      await client.query<{
        procedure_type_id: string;
        tooth: string | null;
        surfaces: string[];
        status: string;
        patient_id: string;
        plan_status: string;
      }>(
        `SELECT item.procedure_type_id, item.tooth, item.surfaces, item.status,
                plan.patient_id, plan.status AS plan_status
         FROM clinical.treatment_plan_items AS item
         JOIN clinical.treatment_plans AS plan ON plan.id = item.plan_id
         WHERE item.id = $1 FOR UPDATE OF item`,
        [payload.planItemId]
      )
    ).rows[0];
    if (!item || item.patient_id !== session.patient_id) {
      throw new HttpProblem(404, 'not_found', 'Plan item not found for this patient.');
    }
    if (item.status !== 'planned' || !['proposed', 'accepted'].includes(item.plan_status)) {
      throw new HttpProblem(
        422,
        'domain_rule_violated',
        'Only a planned item of an open plan can be performed.'
      );
    }
    procedureTypeId = item.procedure_type_id;
    tooth = item.tooth;
    surfaces = item.surfaces;
  } else {
    const type = (
      await client.query<{ id: string; scope: string }>(
        `SELECT id, scope FROM catalog.procedure_types WHERE code = $1 AND active
         ORDER BY clinic_id NULLS LAST LIMIT 1`,
        [payload.procedureCode]
      )
    ).rows[0];
    if (!type)
      throw new HttpProblem(
        422,
        'domain_rule_violated',
        `Unknown procedure "${payload.procedureCode}".`
      );
    const issue = (path: string, message: string) =>
      new HttpProblem(400, 'validation_failed', message, { issues: [{ path, message }] });
    if (type.scope !== 'mouth' && !payload.tooth) throw issue('tooth', 'Choose a tooth.');
    if (type.scope === 'surfaces' && !payload.surfaces)
      throw issue('surfaces', 'Choose the surfaces.');
    if (type.scope !== 'surfaces' && payload.surfaces)
      throw issue('surfaces', 'This procedure takes no surfaces.');
    procedureTypeId = type.id;
    tooth = payload.tooth ?? null;
    surfaces = payload.surfaces ?? [];
  }

  const id = uuidv7();
  try {
    await client.query(
      `INSERT INTO clinical.procedures
         (id, clinic_id, session_id, patient_id, plan_item_id, procedure_type_id, tooth, surfaces,
          note, started_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        actor.clinicId,
        session.id,
        session.patient_id,
        payload.planItemId ?? null,
        procedureTypeId,
        tooth,
        surfaces,
        payload.note ?? null,
        actor.userId,
      ]
    );
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new HttpProblem(409, 'domain_rule_violated', 'This plan item is already in progress.');
    }
    throw error;
  }
  const row = await loadProcedure(client, id);
  return {
    result: toProcedure(row),
    audit: [
      {
        action: procedureStart.type,
        entity: 'procedure',
        entityId: id,
        before: null,
        after: {
          sessionId: session.id,
          procedure: row.procedure_code,
          tooth: tooth ?? undefined,
          surfaces: surfaces.length ? surfaces : undefined,
          planItemId: payload.planItemId,
        },
      },
    ],
  };
}

function finisher(to: 'completed' | 'cancelled', type: string) {
  return async function finish(
    { client, actor }: HandlerContext,
    payload: ProcedureDecision
  ): Promise<HandlerOutcome<Procedure>> {
    const current = await loadProcedure(client, payload.procedureId);
    const session = await openSession(client, current.session_id);
    if (current.status !== 'in_progress') {
      throw new HttpProblem(
        422,
        'domain_rule_violated',
        `The procedure is already ${current.status}.`
      );
    }
    await client.query(
      `UPDATE clinical.procedures
       SET status = $2, ended_at = now(), ended_by = $3, cancel_reason = $4
       WHERE id = $1`,
      [current.id, to, actor.userId, to === 'cancelled' ? (payload.reason ?? null) : null]
    );
    const audit: AuditChange[] = [
      {
        action: type,
        entity: 'procedure',
        entityId: current.id,
        before: { status: 'in_progress' },
        after: { status: to, reason: payload.reason },
      },
    ];

    if (to === 'completed') {
      // The plan item is done; the plan completes when nothing is left planned.
      if (current.plan_item_id) {
        await client.query(
          `UPDATE clinical.treatment_plan_items SET status = 'done' WHERE id = $1`,
          [current.plan_item_id]
        );
        const plan = (
          await client.query<{ id: string; status: string; open_items: number }>(
            `SELECT plan.id, plan.status,
                    (SELECT count(*)::int FROM clinical.treatment_plan_items
                     WHERE plan_id = plan.id AND status = 'planned') AS open_items
             FROM clinical.treatment_plans AS plan
             JOIN clinical.treatment_plan_items AS item ON item.plan_id = plan.id
             WHERE item.id = $1`,
            [current.plan_item_id]
          )
        ).rows[0]!;
        await client.query(
          'UPDATE clinical.treatment_plans SET version = version + 1 WHERE id = $1',
          [plan.id]
        );
        if (plan.open_items === 0 && plan.status === 'accepted') {
          await client.query(
            `UPDATE clinical.treatment_plans SET status = 'completed', decided_at = now(), decided_by = $2
             WHERE id = $1`,
            [plan.id, actor.userId]
          );
          audit.push({
            action: 'plan.complete',
            entity: 'treatment_plan',
            entityId: plan.id,
            before: { status: 'accepted' },
            after: { status: 'completed' },
          });
        }
      }

      // Record what the procedure changed on the chart, as findings of this session.
      const result = CHART_RESULT[current.procedure_code];
      if (result && current.tooth) {
        const places: (string | null)[] =
          current.surfaces.length && result === 'restoration' ? current.surfaces : [null];
        for (const surface of places) {
          const findingId = uuidv7();
          await client.query(
            `INSERT INTO clinical.findings
               (id, clinic_id, session_id, patient_id, tooth, surface, code, note, recorded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              findingId,
              actor.clinicId,
              session.id,
              session.patient_id,
              current.tooth,
              surface,
              result,
              `${current.procedure_name} completed`,
              actor.userId,
            ]
          );
          await recordChartEvent(client, {
            clinicId: actor.clinicId,
            patientId: session.patient_id,
            sessionId: session.id,
            findingId,
            tooth: current.tooth,
            surface,
            state: result,
          });
        }
      }
    }
    return { result: toProcedure(await loadProcedure(client, current.id)), audit };
  };
}

export async function signSession(
  { client, actor }: HandlerContext,
  payload: SessionSign
): Promise<HandlerOutcome<ClinicalSession>> {
  const session = (
    await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM clinical.clinical_sessions WHERE id = $1 FOR UPDATE`,
      [payload.sessionId]
    )
  ).rows[0];
  if (!session) throw new HttpProblem(404, 'not_found', 'Session not found.');
  if (session.status === 'signed') {
    throw new HttpProblem(409, 'session_signed', 'The session is already signed.');
  }
  if (session.status !== 'completed') {
    throw new HttpProblem(422, 'domain_rule_violated', 'Complete the session before signing it.');
  }
  const row = (
    await client.query<SessionRow>(
      `UPDATE clinical.clinical_sessions SET status = 'signed', signed_at = now(), signed_by = $2
       WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
      [session.id, actor.userId]
    )
  ).rows[0]!;
  return {
    result: toSession(row),
    audit: [
      {
        action: sessionSign.type,
        entity: 'session',
        entityId: row.id,
        before: { status: 'completed' },
        after: { status: 'signed', signedAt: row.signed_at?.toISOString() },
      },
    ],
  };
}

/** Runs each action through its own command, inside the amendment, in this transaction. */
function amender(bus: CommandBus) {
  return async function amend(
    context: HandlerContext,
    payload: SessionAmend
  ): Promise<HandlerOutcome<{ amendment: SessionAmendment; results: unknown[] }>> {
    const { client, actor, commandId } = context;
    const session = (
      await client.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM clinical.clinical_sessions WHERE id = $1 FOR SHARE`,
        [payload.sessionId]
      )
    ).rows[0];
    if (!session) throw new HttpProblem(404, 'not_found', 'Session not found.');
    if (session.status !== 'signed') {
      throw new HttpProblem(
        422,
        'domain_rule_violated',
        'Only a signed session is amended; change it directly.'
      );
    }

    const amendmentId = uuidv7();
    const amendment = (
      await client.query<{ amended_at: Date }>(
        `INSERT INTO clinical.session_amendments
           (id, clinic_id, session_id, reason, command_id, amended_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING amended_at`,
        [amendmentId, actor.clinicId, session.id, payload.reason, commandId, actor.userId]
      )
    ).rows[0]!;

    const audit: AuditChange[] = [
      {
        action: sessionAmend.type,
        entity: 'session',
        entityId: session.id,
        before: null,
        after: {
          amendmentId,
          reason: payload.reason,
          actions: payload.actions.map((action) => action.type),
        },
      },
    ];
    const results: unknown[] = [];
    for (const [index, action] of payload.actions.entries()) {
      if (!(AMENDMENT_ACTIONS as readonly string[]).includes(action.type)) {
        throw new HttpProblem(
          400,
          'validation_failed',
          `${action.type} cannot be used in an amendment.`
        );
      }
      const registered = bus.registered(action.type)!;
      if (!actor.permissions.includes(registered.definition.permission)) {
        throw new HttpProblem(403, 'forbidden', `You do not have permission for ${action.type}.`);
      }
      const withSession =
        action.type === 'diagnosis.retract'
          ? action.payload
          : { ...action.payload, sessionId: session.id };
      const parsed = registered.definition.payload.safeParse(withSession);
      if (!parsed.success) {
        throw new HttpProblem(400, 'validation_failed', 'An amendment action is not valid.', {
          issues: parsed.error.issues.map((issue) => ({
            path: `actions.${index}.payload.${issue.path.join('.')}`,
            message: issue.message,
          })),
        });
      }
      const outcome = await registered.handler({ ...context, amendmentId }, parsed.data);
      results.push(outcome.result);
      audit.push(
        ...outcome.audit.map((change) => ({
          ...change,
          after:
            typeof change.after === 'object' && change.after !== null
              ? { ...change.after, amendmentId }
              : change.after,
        }))
      );
    }

    return {
      result: {
        amendment: {
          id: amendmentId,
          reason: payload.reason,
          amendedAt: amendment.amended_at.toISOString(),
          amendedBy: actor.userId,
        },
        results,
      },
      audit,
    };
  };
}

export function registerProcedureCommands(bus: CommandBus) {
  bus.register(procedureStart, startProcedure);
  bus.register(procedureComplete, finisher('completed', procedureComplete.type));
  bus.register(procedureCancel, finisher('cancelled', procedureCancel.type));
  bus.register(sessionSign, signSession);
  bus.register(sessionAmend, amender(bus));
}
