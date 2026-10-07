import type { PlanItem, ProcedureType, Surface, TreatmentPlan } from '@dental/contracts';
import type { PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';

/** Treatment plan rows and the API shapes they map to. */

export interface PlanRow {
  id: string;
  patient_id: string;
  title: string | null;
  status: TreatmentPlan['status'];
  version: number;
  created_at: Date;
  created_by: string | null;
}

export const PLAN_COLUMNS = 'id, patient_id, title, status, version, created_at, created_by';

interface ItemRow {
  id: string;
  sequence: number;
  tooth: string | null;
  surfaces: Surface[];
  note: string | null;
  status: PlanItem['status'];
  created_at: Date;
  created_by: string | null;
  cancel_reason: string | null;
  procedure_id: string;
  procedure_code: string;
  procedure_name: string;
  procedure_category: ProcedureType['category'];
  procedure_scope: ProcedureType['scope'];
}

export interface ProcedureRow {
  id: string;
  code: string;
  name: string;
  category: ProcedureType['category'];
  scope: ProcedureType['scope'];
  allows_missing_tooth: boolean;
  aliases: string[];
  external_code: string | null;
}

export function toProcedureType(row: ProcedureRow): ProcedureType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    scope: row.scope,
    allowsMissingTooth: row.allows_missing_tooth,
    aliases: row.aliases,
    externalCode: row.external_code,
  };
}

/** The plan with its items in order. */
export async function loadPlan(client: PoolClient, plan: PlanRow): Promise<TreatmentPlan> {
  const { rows } = await client.query<ItemRow>(
    `SELECT item.id, item.sequence, item.tooth, item.surfaces, item.note, item.status,
            item.created_at, item.created_by, item.cancel_reason,
            type.id AS procedure_id, type.code AS procedure_code, type.name AS procedure_name,
            type.category AS procedure_category, type.scope AS procedure_scope
     FROM clinical.treatment_plan_items AS item
     JOIN catalog.procedure_types AS type ON type.id = item.procedure_type_id
     WHERE item.plan_id = $1
     ORDER BY item.sequence`,
    [plan.id]
  );
  return {
    id: plan.id,
    patientId: plan.patient_id,
    title: plan.title,
    status: plan.status,
    version: plan.version,
    createdAt: plan.created_at.toISOString(),
    createdBy: plan.created_by,
    items: rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      procedureType: {
        id: row.procedure_id,
        code: row.procedure_code,
        name: row.procedure_name,
        category: row.procedure_category,
        scope: row.procedure_scope,
      },
      tooth: row.tooth,
      surfaces: row.surfaces,
      note: row.note,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      createdBy: row.created_by,
      cancelReason: row.cancel_reason,
    })),
  };
}

/** The plan, locked for a change; proposed or accepted plans take changes. */
export async function openPlan(client: PoolClient, planId: string): Promise<PlanRow> {
  const plan = (
    await client.query<PlanRow>(
      `SELECT ${PLAN_COLUMNS} FROM clinical.treatment_plans WHERE id = $1 FOR UPDATE`,
      [planId]
    )
  ).rows[0];
  if (!plan) throw new HttpProblem(404, 'not_found', 'Treatment plan not found.');
  if (plan.status !== 'proposed' && plan.status !== 'accepted') {
    throw new HttpProblem(422, 'domain_rule_violated', `The plan is ${plan.status}.`);
  }
  return plan;
}
