/**
 * Teeth, surfaces, findings and periodontal sites (C3). Codes are language-neutral and rendered
 * per locale (spec section E). Teeth use FDI notation, the default (spec section Q, 10).
 */

/** Permanent (11-48) and primary (51-85) teeth in FDI notation. */
export function isValidFdi(code: string): boolean {
  if (!/^\d\d$/.test(code)) return false;
  const quadrant = Number(code[0]);
  const tooth = Number(code[1]);
  if (quadrant >= 1 && quadrant <= 4) return tooth >= 1 && tooth <= 8;
  if (quadrant >= 5 && quadrant <= 8) return tooth >= 1 && tooth <= 5;
  return false;
}

/**
 * Universal numbering (1-32, permanent teeth): 1 is the upper right third molar, counting
 * along the upper arch to 16, the upper left third molar, then from 17, the lower left third
 * molar, to 32, the lower right third molar. Records always keep FDI; this converts what a
 * clinic using Universal says and sees.
 */
export function universalToFdi(number: number): string | null {
  if (!Number.isInteger(number) || number < 1 || number > 32) return null;
  if (number <= 8) return `1${9 - number}`;
  if (number <= 16) return `2${number - 8}`;
  if (number <= 24) return `3${25 - number}`;
  return `4${number - 24}`;
}

export function fdiToUniversal(code: string): number | null {
  if (!isValidFdi(code) || Number(code[0]) > 4) return null;
  const quadrant = Number(code[0]);
  const tooth = Number(code[1]);
  return quadrant === 1
    ? 9 - tooth
    : quadrant === 2
      ? 8 + tooth
      : quadrant === 3
        ? 25 - tooth
        : 24 + tooth;
}

/** Incisors and canines have an incisal edge (I) instead of an occlusal surface (O). */
export function isAnterior(tooth: string): boolean {
  return Number(tooth[1]) <= 3;
}

/** The permanent teeth in chart order: upper right to upper left, lower right to lower left. */
export const PERMANENT_TEETH = {
  upper: [
    '18',
    '17',
    '16',
    '15',
    '14',
    '13',
    '12',
    '11',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '27',
    '28',
  ],
  lower: [
    '48',
    '47',
    '46',
    '45',
    '44',
    '43',
    '42',
    '41',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '37',
    '38',
  ],
} as const;

/** Mesial, occlusal, incisal, distal, buccal (facial) and lingual (palatal). */
export const SURFACES = ['M', 'O', 'I', 'D', 'B', 'L'] as const;
export type Surface = (typeof SURFACES)[number];

/** The surfaces a tooth has. */
export function surfacesOf(tooth: string): Surface[] {
  return isAnterior(tooth) ? ['M', 'I', 'D', 'B', 'L'] : ['M', 'O', 'D', 'B', 'L'];
}

/**
 * Examination findings. `scope` says whether a finding applies to surfaces, the whole tooth or
 * either. `state` is what it does to the chart; null clears the chart at that place.
 */
export const FINDINGS = {
  sound: { scope: 'either', state: null },
  caries: { scope: 'surface', state: 'caries' },
  restoration: { scope: 'surface', state: 'restoration' },
  fracture: { scope: 'either', state: 'fracture' },
  watch: { scope: 'either', state: 'watch' },
  missing: { scope: 'tooth', state: 'missing' },
  crown: { scope: 'tooth', state: 'crown' },
  root_canal_treated: { scope: 'tooth', state: 'root_canal_treated' },
  implant: { scope: 'tooth', state: 'implant' },
  impacted: { scope: 'tooth', state: 'impacted' },
  mobility: { scope: 'tooth', state: 'mobility' },
} as const satisfies Record<
  string,
  { scope: 'surface' | 'tooth' | 'either'; state: string | null }
>;

export type FindingCode = keyof typeof FINDINGS;
export const FINDING_CODES = Object.keys(FINDINGS) as FindingCode[];

/** Six probing sites per tooth: mesio-, mid- and disto-buccal, then the same lingually. */
export const PERIO_SITES = ['MB', 'B', 'DB', 'ML', 'L', 'DL'] as const;
export type PerioSite = (typeof PERIO_SITES)[number];

export const NOTE_TYPES = ['clinical', 'plan', 'consent', 'other'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export interface Finding {
  id: string;
  sessionId: string;
  tooth: string;
  /** Null for a whole-tooth finding. */
  surface: Surface | null;
  code: FindingCode;
  value: string | null;
  note: string | null;
  /** The earlier finding this one corrects. */
  supersedesId: string | null;
  recordedAt: string;
  recordedBy: string | null;
  /** Set when the finding was recorded in an amendment of a signed session. */
  amendmentId: string | null;
}

/** One place on the current chart: a tooth, or one of its surfaces. */
export interface ChartEntry {
  tooth: string;
  surface: Surface | null;
  state: string;
  findingId: string;
  updatedAt: string;
}

export interface ChartEvent {
  id: string;
  tooth: string;
  surface: Surface | null;
  /** Null when the event cleared the place. */
  state: string | null;
  findingId: string;
  sessionId: string;
  recordedAt: string;
}

export interface PerioMeasurement {
  tooth: string;
  site: PerioSite;
  pocketDepth: number;
  bleeding: boolean;
  recession: number | null;
  recordedAt: string;
}

export interface ClinicalNote {
  id: string;
  type: NoteType;
  body: string;
  recordedAt: string;
  recordedBy: string | null;
  /** Set for an addendum written after signing. */
  amendmentId: string | null;
}

export type SessionStatus = 'open' | 'completed' | 'signed';

export interface ClinicalSession {
  id: string;
  patientId: string;
  providerId: string | null;
  status: SessionStatus;
  chiefComplaint: string | null;
  startedAt: string;
  endedAt: string | null;
  signedAt: string | null;
  signedBy: string | null;
}

/** GET /v1/sessions/:id: the session with everything recorded in it. */
export interface SessionDetail extends ClinicalSession {
  findings: Finding[];
  diagnoses: Diagnosis[];
  procedures: Procedure[];
  amendments: SessionAmendment[];
  /** The latest reading per tooth and site in this session. */
  perio: PerioMeasurement[];
  notes: ClinicalNote[];
}

/** GET /v1/patients/:id/chart */
export interface PatientChart {
  entries: ChartEntry[];
  /** Present when asked for with ?history=true: every event, oldest first. */
  events?: ChartEvent[];
}

/**
 * Common dental diagnoses as language-neutral codes, rendered per locale. "other" needs a
 * description. Codes can later map to a terminology such as SNOMED CT or ICD-10.
 */
export const DIAGNOSIS_CODES = [
  'caries_enamel',
  'caries_dentine',
  'reversible_pulpitis',
  'irreversible_pulpitis',
  'pulp_necrosis',
  'apical_periodontitis',
  'apical_abscess',
  'cracked_tooth',
  'tooth_wear',
  'dentine_hypersensitivity',
  'gingivitis',
  'periodontitis',
  'pericoronitis',
  'other',
] as const;
export type DiagnosisCode = (typeof DIAGNOSIS_CODES)[number];

export const DIAGNOSIS_CERTAINTY = ['possible', 'probable', 'definite'] as const;
export type DiagnosisCertainty = (typeof DIAGNOSIS_CERTAINTY)[number];

/**
 * suggested -> confirmed or rejected; confirmed -> retracted (entered in error). Only a
 * dentist confirms, rejects or retracts.
 */
export type DiagnosisStatus = 'suggested' | 'confirmed' | 'rejected' | 'retracted';

export interface Diagnosis {
  id: string;
  sessionId: string;
  patientId: string;
  /** Null for a diagnosis of the whole mouth, such as generalised gingivitis. */
  tooth: string | null;
  code: DiagnosisCode;
  label: string | null;
  certainty: DiagnosisCertainty | null;
  status: DiagnosisStatus;
  suggestedBy: string | null;
  suggestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string | null;
  amendmentId: string | null;
}

export type ProcedureStatus = 'in_progress' | 'completed' | 'cancelled';

/** Treatment performed in a session, often a planned item. */
export interface Procedure {
  id: string;
  sessionId: string;
  planItemId: string | null;
  procedureType: { id: string; code: string; name: string };
  tooth: string | null;
  surfaces: Surface[];
  status: ProcedureStatus;
  note: string | null;
  startedAt: string;
  startedBy: string | null;
  endedAt: string | null;
  endedBy: string | null;
  cancelReason: string | null;
}

/** A correction to a signed session, with its reason. */
export interface SessionAmendment {
  id: string;
  reason: string;
  amendedAt: string;
  amendedBy: string | null;
}

/** What may be done inside an amendment of a signed session. */
export const AMENDMENT_ACTIONS = [
  'note.add',
  'finding.add',
  'diagnosis.record',
  'diagnosis.retract',
] as const;
export type AmendmentAction = (typeof AMENDMENT_ACTIONS)[number];
