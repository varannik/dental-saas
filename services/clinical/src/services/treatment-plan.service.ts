import { and, desc, eq, max, ne, type SQL } from 'drizzle-orm';

import {
  createDatabaseConnection,
  patients,
  treatmentPlanItems,
  treatmentPlans,
} from '@saas/config';
import type {
  CreateTreatmentPlanInput,
  CreateTreatmentPlanItemInput,
  UpdateTreatmentPlanItemInput,
} from '../schemas/treatment-plan.schema.js';

const patientActive: SQL = ne(patients.status, 'DELETED');

export class TreatmentPlanNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Treatment plan not found.');
    this.name = 'TreatmentPlanNotFoundError';
  }
}

export class TreatmentPlanItemNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Treatment plan item not found.');
    this.name = 'TreatmentPlanItemNotFoundError';
  }
}

export class TreatmentPlanStateError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'TreatmentPlanStateError';
  }
}

export class TreatmentPlanPatientNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Patient not found.');
    this.name = 'TreatmentPlanPatientNotFoundError';
  }
}

function numToApi(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function optionalMoneyString(n: number | null | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return n.toFixed(2);
}

async function assertPatientInTenant(patientId: string, tenantId: string): Promise<void> {
  const db = createDatabaseConnection();
  const row = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId), patientActive) as SQL)
    .limit(1);
  if (!row[0]) throw new TreatmentPlanPatientNotFoundError();
}

async function loadPlan(
  planId: string,
  tenantId: string
): Promise<typeof treatmentPlans.$inferSelect> {
  const db = createDatabaseConnection();
  const rows = await db
    .select()
    .from(treatmentPlans)
    .where(and(eq(treatmentPlans.id, planId), eq(treatmentPlans.tenantId, tenantId)) as SQL)
    .limit(1);
  const p = rows[0];
  if (!p) throw new TreatmentPlanNotFoundError();
  return p;
}

function assertPlanItemsEditable(plan: typeof treatmentPlans.$inferSelect): void {
  if (plan.status !== 'DRAFT') {
    throw new TreatmentPlanStateError(
      'Treatment plan items can only be edited while status is DRAFT.'
    );
  }
}

function assertPlanPresentable(plan: typeof treatmentPlans.$inferSelect): void {
  if (plan.status !== 'DRAFT') {
    throw new TreatmentPlanStateError(
      `Only draft plans can be presented; current status is ${plan.status}.`
    );
  }
}

function assertPlanAcceptable(plan: typeof treatmentPlans.$inferSelect): void {
  if (plan.status !== 'PRESENTED') {
    throw new TreatmentPlanStateError(
      `Only presented plans can be accepted; current status is ${plan.status}.`
    );
  }
}

function toPlanRowResponse(row: typeof treatmentPlans.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenantId,
    patientId: row.patientId,
    createdById: row.createdById,
    title: row.title,
    status: row.status,
    totalEstimatedCost: numToApi(row.totalEstimatedCost),
    estimatedInsuranceCoverage: numToApi(row.estimatedInsuranceCoverage),
    notes: row.notes,
    presentedAt: row.presentedAt == null ? null : (row.presentedAt as Date).toISOString(),
    presentedById: row.presentedById,
    acceptedAt: row.acceptedAt == null ? null : (row.acceptedAt as Date).toISOString(),
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

function toItemRowResponse(row: typeof treatmentPlanItems.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    planId: row.planId,
    cdtCode: row.cdtCode,
    toothNumber: row.toothNumber,
    surface: row.surface,
    phase: row.phase,
    sequenceOrder: row.sequenceOrder,
    estimatedFee: numToApi(row.estimatedFee),
    estimatedPatientPortion: numToApi(row.estimatedPatientPortion),
    notes: row.notes,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

async function refreshPlanFeeTotalFromItems(planId: string): Promise<void> {
  const db = createDatabaseConnection();
  const rows = await db
    .select({ f: treatmentPlanItems.estimatedFee })
    .from(treatmentPlanItems)
    .where(eq(treatmentPlanItems.planId, planId));
  let sum = 0;
  for (const r of rows) {
    if (r.f != null) {
      const v = Number.parseFloat(String(r.f));
      if (!Number.isNaN(v)) sum += v;
    }
  }
  const now = new Date();
  await db
    .update(treatmentPlans)
    .set({
      totalEstimatedCost: sum === 0 ? null : sum.toFixed(2),
      updatedAt: now,
    })
    .where(eq(treatmentPlans.id, planId));
}

async function nextSequenceOrder(planId: string): Promise<number> {
  const db = createDatabaseConnection();
  const rows = await db
    .select({ m: max(treatmentPlanItems.sequenceOrder) })
    .from(treatmentPlanItems)
    .where(eq(treatmentPlanItems.planId, planId));
  const m = rows[0]?.m;
  const n = m == null ? 0 : Number(m);
  return Number.isFinite(n) ? n + 1 : 1;
}

export async function createTreatmentPlan(
  tenantId: string,
  patientId: string,
  createdById: string,
  input: CreateTreatmentPlanInput
): Promise<Record<string, unknown>> {
  await assertPatientInTenant(patientId, tenantId);

  const db = createDatabaseConnection();
  const now = new Date();
  const inserted = await db
    .insert(treatmentPlans)
    .values({
      tenantId,
      patientId,
      createdById,
      title: input.title ?? null,
      notes: input.notes ?? null,
      status: 'DRAFT',
      totalEstimatedCost: optionalMoneyString(input.totalEstimatedCost ?? null),
      estimatedInsuranceCoverage: optionalMoneyString(input.estimatedInsuranceCoverage ?? null),
      presentedAt: null,
      presentedById: null,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to create treatment plan.');
  return toPlanRowResponse(row);
}

export async function listTreatmentPlansForPatient(
  patientId: string,
  tenantId: string
): Promise<Record<string, unknown>> {
  await assertPatientInTenant(patientId, tenantId);

  const db = createDatabaseConnection();
  const rows = await db
    .select()
    .from(treatmentPlans)
    .where(
      and(eq(treatmentPlans.patientId, patientId), eq(treatmentPlans.tenantId, tenantId)) as SQL
    )
    .orderBy(desc(treatmentPlans.createdAt), desc(treatmentPlans.id));

  return { treatmentPlans: rows.map((r) => toPlanRowResponse(r)) };
}

export async function getTreatmentPlanWithItems(
  planId: string,
  tenantId: string
): Promise<Record<string, unknown>> {
  const plan = await loadPlan(planId, tenantId);
  const db = createDatabaseConnection();
  const items = await db
    .select()
    .from(treatmentPlanItems)
    .where(eq(treatmentPlanItems.planId, planId))
    .orderBy(treatmentPlanItems.sequenceOrder, treatmentPlanItems.id);

  return {
    plan: toPlanRowResponse(plan),
    items: items.map((i) => toItemRowResponse(i)),
  };
}

export async function addTreatmentPlanItem(
  planId: string,
  tenantId: string,
  input: CreateTreatmentPlanItemInput
): Promise<Record<string, unknown>> {
  const plan = await loadPlan(planId, tenantId);
  assertPlanItemsEditable(plan);

  const seq = input.sequenceOrder != null ? input.sequenceOrder : await nextSequenceOrder(planId);
  const db = createDatabaseConnection();
  const now = new Date();
  const inserted = await db
    .insert(treatmentPlanItems)
    .values({
      planId,
      cdtCode: input.cdtCode,
      toothNumber: input.toothNumber ?? null,
      surface: input.surface ?? null,
      phase: input.phase ?? null,
      sequenceOrder: seq,
      estimatedFee: optionalMoneyString(input.estimatedFee ?? null),
      estimatedPatientPortion: optionalMoneyString(input.estimatedPatientPortion ?? null),
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to add plan item.');

  await refreshPlanFeeTotalFromItems(planId);

  return toItemRowResponse(row);
}

export async function updateTreatmentPlanItem(
  planId: string,
  itemId: string,
  tenantId: string,
  input: UpdateTreatmentPlanItemInput
): Promise<Record<string, unknown>> {
  const plan = await loadPlan(planId, tenantId);
  assertPlanItemsEditable(plan);

  const db = createDatabaseConnection();
  const existingRows = await db
    .select()
    .from(treatmentPlanItems)
    .where(and(eq(treatmentPlanItems.id, itemId), eq(treatmentPlanItems.planId, planId)) as SQL)
    .limit(1);
  const existing = existingRows[0];
  if (!existing) throw new TreatmentPlanItemNotFoundError();

  const now = new Date();
  const updated = await db
    .update(treatmentPlanItems)
    .set({
      ...(input.cdtCode !== undefined ? { cdtCode: input.cdtCode } : {}),
      ...(input.toothNumber !== undefined ? { toothNumber: input.toothNumber } : {}),
      ...(input.surface !== undefined ? { surface: input.surface } : {}),
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
      ...(input.sequenceOrder !== undefined ? { sequenceOrder: input.sequenceOrder } : {}),
      ...(input.estimatedFee !== undefined
        ? { estimatedFee: optionalMoneyString(input.estimatedFee ?? null) }
        : {}),
      ...(input.estimatedPatientPortion !== undefined
        ? {
            estimatedPatientPortion: optionalMoneyString(input.estimatedPatientPortion ?? null),
          }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: now,
    })
    .where(and(eq(treatmentPlanItems.id, itemId), eq(treatmentPlanItems.planId, planId)) as SQL)
    .returning();
  const row = updated[0];
  if (!row) throw new TreatmentPlanItemNotFoundError();

  await refreshPlanFeeTotalFromItems(planId);

  return toItemRowResponse(row);
}

export async function removeTreatmentPlanItem(
  planId: string,
  itemId: string,
  tenantId: string
): Promise<void> {
  const plan = await loadPlan(planId, tenantId);
  assertPlanItemsEditable(plan);

  const db = createDatabaseConnection();
  const deleted = await db
    .delete(treatmentPlanItems)
    .where(and(eq(treatmentPlanItems.id, itemId), eq(treatmentPlanItems.planId, planId)) as SQL)
    .returning({ id: treatmentPlanItems.id });
  if (!deleted[0]) throw new TreatmentPlanItemNotFoundError();

  await refreshPlanFeeTotalFromItems(planId);
}

export async function markTreatmentPlanPresented(
  planId: string,
  tenantId: string,
  userId: string
): Promise<Record<string, unknown>> {
  const plan = await loadPlan(planId, tenantId);
  assertPlanPresentable(plan);

  const db = createDatabaseConnection();
  const now = new Date();
  const updated = await db
    .update(treatmentPlans)
    .set({
      status: 'PRESENTED',
      presentedAt: now,
      presentedById: userId,
      updatedAt: now,
    })
    .where(
      and(
        eq(treatmentPlans.id, planId),
        eq(treatmentPlans.tenantId, tenantId),
        eq(treatmentPlans.status, 'DRAFT')
      ) as SQL
    )
    .returning();
  const row = updated[0];
  if (!row) throw new TreatmentPlanStateError('Plan could not be presented; refresh and retry.');
  return toPlanRowResponse(row);
}

export async function markTreatmentPlanAccepted(
  planId: string,
  tenantId: string
): Promise<Record<string, unknown>> {
  const plan = await loadPlan(planId, tenantId);
  assertPlanAcceptable(plan);

  const db = createDatabaseConnection();
  const now = new Date();
  const updated = await db
    .update(treatmentPlans)
    .set({
      status: 'ACCEPTED',
      acceptedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(treatmentPlans.id, planId),
        eq(treatmentPlans.tenantId, tenantId),
        eq(treatmentPlans.status, 'PRESENTED')
      ) as SQL
    )
    .returning();
  const row = updated[0];
  if (!row) throw new TreatmentPlanStateError('Plan could not be accepted; refresh and retry.');
  return toPlanRowResponse(row);
}
