/** Medical and dental history: shapes and options shared by the API and the web client. */

export const HISTORY_KINDS = ['condition', 'medication', 'allergy', 'risk_factor'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe', 'unknown'] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

/** Why an entry ended. Entries are ended, never edited or deleted. */
export const HISTORY_END_REASONS = ['resolved', 'stopped', 'entered_in_error'] as const;
export type HistoryEndReason = (typeof HISTORY_END_REASONS)[number];

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  label: string;
  code: string | null;
  detail: string | null;
  severity: AllergySeverity | null;
  onsetDate: string | null;
  status: 'active' | 'ended';
  notedAt: string;
  notedBy: string | null;
  endedAt: string | null;
  endedBy: string | null;
  endReason: HistoryEndReason | null;
  endNote: string | null;
}

/** GET /v1/patients/:id/history, grouped as the spec describes. */
export interface PatientHistory {
  conditions: HistoryEntry[];
  medications: HistoryEntry[];
  allergies: HistoryEntry[];
  riskFactors: HistoryEntry[];
}

export const HISTORY_GROUP: Record<HistoryKind, keyof PatientHistory> = {
  condition: 'conditions',
  medication: 'medications',
  allergy: 'allergies',
  risk_factor: 'riskFactors',
};
