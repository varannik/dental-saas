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
}

/** GET /v1/sessions/:id: the session with everything recorded in it. */
export interface SessionDetail extends ClinicalSession {
  findings: Finding[];
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
