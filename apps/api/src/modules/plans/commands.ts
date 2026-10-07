import {
  planAccept,
  planCancel,
  planCreate,
  planItemAdd,
  planItemCancel,
  planReorder,
  type PlanCreate,
  type PlanDecision,
  type PlanItemAdd,
  type PlanItemCancel,
  type PlanReorder,
  type TreatmentPlan,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import type { PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { CommandBus, HandlerContext, HandlerOutcome } from '../commands/bus.js';
import { loadPlan, openPlan, PLAN_COLUMNS, type PlanRow, type ProcedureRow } from './model.js';

/**
 * Treatment planning (C5). Items keep one contiguous sequence per plan. Every item change bumps
 * the plan's version, so a reorder made against an older view is refused (ADR 0003).
 */

const UNIQUE_VIOLATION = '23505';

async function bumpVersion(client: PoolClient, planId: string): Promise<PlanRow> {
  return (
    await client.query<PlanRow>(
      `UPDATE clinical.treatment_plans SET version = version + 1 WHERE id = $1
       RETURNING ${PLAN_COLUMNS}`,
      [planId]
    )
  ).rows[0]!;
}

export async function createPlan(
  { client, actor }: HandlerContext,
  payload: PlanCreate
): Promise<HandlerOutcome<TreatmentPlan>> {
  const patient = (
    await client.query<{ status: string }>(
      'SELECT status FROM clinical.patients WHERE id = $1 FOR SHARE',
      [payload.patientId]
    )
  ).rows[0];
  if (!patient) throw new HttpProblem(404, 'not_found', 'Patient not found.');
  if (patient.status !== 'active') {
    throw new HttpProblem(
      422,
      'domain_rule_violated',
      'The patient is archived. Restore them first.'
    );
  }
  const open = (
    await client.query<{ id: string }>(
      `SELECT id FROM clinical.treatment_plans
       WHERE patient_id = $1 AND status IN ('proposed', 'accepted')`,
      [payload.patientId]
    )
  ).rows[0];
  const alreadyOpen = (planId?: string) =>
    new HttpProblem(409, 'plan_open', 'This patient already has an open treatment plan.', {
      ...(planId ? { planId } : {}),
    });
  if (open) throw alreadyOpen(open.id);

  let plan: PlanRow;
  try {
    plan = (
      await client.query<PlanRow>(
        `INSERT INTO clinical.treatment_plans (id, clinic_id, patient_id, title, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${PLAN_COLUMNS}`,
        [uuidv7(), actor.clinicId, payload.patientId, payload.title ?? null, actor.userId]
      )
    ).rows[0]!;
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw alreadyOpen();
    throw error;
  }
  return {
    result: await loadPlan(client, plan),
    audit: [
      {
        action: planCreate.type,
        entity: 'treatment_plan',
        entityId: plan.id,
        before: null,
        after: { patientId: plan.patient_id, title: plan.title ?? undefined },
      },
    ],
  };
}

export async function addPlanItem(
  { client, actor }: HandlerContext,
  payload: PlanItemAdd
): Promise<HandlerOutcome<TreatmentPlan>> {
  const plan = await openPlan(client, payload.planId);
  const procedure = (
    await client.query<ProcedureRow>(
      `SELECT id, code, name, category, scope, allows_missing_tooth, aliases, external_code
       FROM catalog.procedure_types
       WHERE code = $1 AND active
       ORDER BY clinic_id NULLS LAST
       LIMIT 1`,
      [payload.procedureCode]
    )
  ).rows[0];
  if (!procedure) {
    throw new HttpProblem(
      422,
      'domain_rule_violated',
      `Unknown procedure "${payload.procedureCode}".`
    );
  }
  const issue = (path: string, message: string) =>
    new HttpProblem(400, 'validation_failed', message, { issues: [{ path, message }] });
  if (procedure.scope !== 'mouth' && !payload.tooth) throw issue('tooth', 'Choose a tooth.');
  if (procedure.scope === 'mouth' && payload.tooth) {
    throw issue('tooth', `${procedure.name} is for the whole mouth, not one tooth.`);
  }
  if (procedure.scope === 'surfaces' && !payload.surfaces)
    throw issue('surfaces', 'Choose the surfaces.');
  if (procedure.scope !== 'surfaces' && payload.surfaces) {
    throw issue('surfaces', `${procedure.name} does not take surfaces.`);
  }
  if (payload.tooth && !procedure.allows_missing_tooth) {
    const missing = await client.query(
      `SELECT 1 FROM clinical.chart_entries
       WHERE patient_id = $1 AND tooth = $2 AND surface = '' AND state = 'missing'`,
      [plan.patient_id, payload.tooth]
    );
    if (missing.rowCount) {
      throw new HttpProblem(
        422,
        'domain_rule_violated',
        `Tooth ${payload.tooth} is charted as missing.`
      );
    }
  }

  // At the end, or right after another item: later items move down one place.
  let sequence: number;
  if (payload.afterItemId) {
    const after = (
      await client.query<{ sequence: number }>(
        'SELECT sequence FROM clinical.treatment_plan_items WHERE id = $1 AND plan_id = $2',
        [payload.afterItemId, plan.id]
      )
    ).rows[0];
    if (!after) throw issue('afterItemId', 'That item is not in this plan.');
    sequence = after.sequence + 1;
    await client.query(
      `UPDATE clinical.treatment_plan_items SET sequence = sequence + 1
       WHERE plan_id = $1 AND sequence >= $2`,
      [plan.id, sequence]
    );
  } else {
    sequence = (
      await client.query<{ next: number }>(
        `SELECT coalesce(max(sequence), 0) + 1 AS next FROM clinical.treatment_plan_items
           WHERE plan_id = $1`,
        [plan.id]
      )
    ).rows[0]!.next;
  }

  const itemId = uuidv7();
  await client.query(
    `INSERT INTO clinical.treatment_plan_items
       (id, clinic_id, plan_id, procedure_type_id, tooth, surfaces, sequence, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      itemId,
      actor.clinicId,
      plan.id,
      procedure.id,
      payload.tooth ?? null,
      payload.surfaces ?? [],
      sequence,
      payload.note ?? null,
      actor.userId,
    ]
  );
  const updated = await bumpVersion(client, plan.id);
  return {
    result: await loadPlan(client, updated),
    audit: [
      {
        action: planItemAdd.type,
        entity: 'treatment_plan_item',
        entityId: itemId,
        before: null,
        after: {
          planId: plan.id,
          procedure: procedure.code,
          tooth: payload.tooth,
          surfaces: payload.surfaces,
          sequence,
        },
      },
    ],
  };
}

export async function cancelPlanItem(
  { client }: HandlerContext,
  payload: PlanItemCancel
): Promise<HandlerOutcome<TreatmentPlan>> {
  const item = (
    await client.query<{ plan_id: string; status: string }>(
      'SELECT plan_id, status FROM clinical.treatment_plan_items WHERE id = $1',
      [payload.itemId]
    )
  ).rows[0];
  if (!item) throw new HttpProblem(404, 'not_found', 'Plan item not found.');
  const plan = await openPlan(client, item.plan_id);
  if (item.status !== 'planned') {
    throw new HttpProblem(422, 'domain_rule_violated', `The item is already ${item.status}.`);
  }
  await client.query(
    `UPDATE clinical.treatment_plan_items SET status = 'cancelled', cancel_reason = $2 WHERE id = $1`,
    [payload.itemId, payload.reason ?? null]
  );
  const updated = await bumpVersion(client, plan.id);
  return {
    result: await loadPlan(client, updated),
    audit: [
      {
        action: planItemCancel.type,
        entity: 'treatment_plan_item',
        entityId: payload.itemId,
        before: { status: 'planned' },
        after: { status: 'cancelled', reason: payload.reason },
      },
    ],
  };
}

export async function reorderPlan(
  { client }: HandlerContext,
  payload: PlanReorder
): Promise<HandlerOutcome<TreatmentPlan>> {
  const plan = await openPlan(client, payload.planId);
  if (plan.version !== payload.version) {
    throw new HttpProblem(409, 'version_conflict', 'The plan was changed by someone else.', {
      currentVersion: plan.version,
    });
  }
  const current = (
    await client.query<{ id: string }>(
      'SELECT id FROM clinical.treatment_plan_items WHERE plan_id = $1 ORDER BY sequence',
      [plan.id]
    )
  ).rows.map((row) => row.id);
  const sameItems =
    current.length === payload.itemIds.length &&
    payload.itemIds.every((id) => current.includes(id));
  if (!sameItems) {
    throw new HttpProblem(400, 'validation_failed', 'Send every item of the plan exactly once.', {
      issues: [{ path: 'itemIds', message: 'Send every item of the plan exactly once.' }],
    });
  }
  // The unique (plan, sequence) check is deferred to commit, so positions can be swapped.
  await client.query(
    `UPDATE clinical.treatment_plan_items AS item SET sequence = ordered.position
     FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered (id, position)
     WHERE item.id = ordered.id AND item.plan_id = $1`,
    [plan.id, payload.itemIds]
  );
  const updated = await bumpVersion(client, plan.id);
  return {
    result: await loadPlan(client, updated),
    audit: [
      {
        action: planReorder.type,
        entity: 'treatment_plan',
        entityId: plan.id,
        before: { order: current, version: plan.version },
        after: { order: payload.itemIds, version: updated.version },
      },
    ],
  };
}

function decider(to: 'accepted' | 'cancelled', type: string) {
  return async function decide(
    { client, actor }: HandlerContext,
    payload: PlanDecision
  ): Promise<HandlerOutcome<TreatmentPlan>> {
    const plan = await openPlan(client, payload.planId);
    if (to === 'accepted' && plan.status !== 'proposed') {
      throw new HttpProblem(422, 'domain_rule_violated', 'The plan is already accepted.');
    }
    const updated = (
      await client.query<PlanRow>(
        `UPDATE clinical.treatment_plans
         SET status = $2, decided_at = now(), decided_by = $3, reason = $4, version = version + 1
         WHERE id = $1
         RETURNING ${PLAN_COLUMNS}`,
        [plan.id, to, actor.userId, payload.reason ?? null]
      )
    ).rows[0]!;
    return {
      result: await loadPlan(client, updated),
      audit: [
        {
          action: type,
          entity: 'treatment_plan',
          entityId: plan.id,
          before: { status: plan.status },
          after: { status: to, reason: payload.reason },
        },
      ],
    };
  };
}

export function registerPlanCommands(bus: CommandBus) {
  bus.register(planCreate, createPlan);
  bus.register(planItemAdd, addPlanItem);
  bus.register(planItemCancel, cancelPlanItem);
  bus.register(planReorder, reorderPlan);
  bus.register(planAccept, decider('accepted', planAccept.type));
  bus.register(planCancel, decider('cancelled', planCancel.type));
}
