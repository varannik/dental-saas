import type { Surface } from './chart.js';

/** The procedure catalog and treatment plans (C5): shapes shared by the API and the web client. */

export const PROCEDURE_CATEGORIES = [
  'diagnostic',
  'preventive',
  'restorative',
  'endodontic',
  'periodontic',
  'prosthodontic',
  'oral_surgery',
  'implant',
  'other',
] as const;
export type ProcedureCategory = (typeof PROCEDURE_CATEGORIES)[number];

/** What a procedure is done on: one tooth, some surfaces of a tooth, or the whole mouth. */
export const PROCEDURE_SCOPES = ['tooth', 'surfaces', 'mouth'] as const;
export type ProcedureScope = (typeof PROCEDURE_SCOPES)[number];

export interface ProcedureType {
  id: string;
  code: string;
  name: string;
  category: ProcedureCategory;
  scope: ProcedureScope;
  /** Whether it can be planned on a tooth the chart shows as missing, such as an implant. */
  allowsMissingTooth: boolean;
  /** Spoken names, for voice. */
  aliases: string[];
  /** A code in a licensed coding system, when the clinic maps one. */
  externalCode: string | null;
}

/** proposed -> accepted -> completed; proposed or accepted -> cancelled. */
export type PlanStatus = 'proposed' | 'accepted' | 'completed' | 'cancelled';

/** planned -> done (when performed, C6) or cancelled. */
export type PlanItemStatus = 'planned' | 'done' | 'cancelled';

export interface PlanItem {
  id: string;
  /** 1-based position in the plan; contiguous across all items. */
  sequence: number;
  procedureType: Pick<ProcedureType, 'id' | 'code' | 'name' | 'category' | 'scope'>;
  tooth: string | null;
  surfaces: Surface[];
  note: string | null;
  status: PlanItemStatus;
  createdAt: string;
  createdBy: string | null;
  cancelReason: string | null;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  title: string | null;
  status: PlanStatus;
  /** Changes with every item change, so a reorder from a stale view is refused. */
  version: number;
  createdAt: string;
  createdBy: string | null;
  items: PlanItem[];
}
