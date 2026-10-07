import type { DiagnosisCode, FindingCode, PerioSite, Surface } from '@dental/contracts';
import { withClinic, type Pool } from '../../platform/db.js';

/**
 * The dental vocabulary that biases speech recognition (V2, ADR 0005): spoken names of
 * findings, diagnoses, surfaces, sites and perio terms, then the clinic's own catalog. Built per
 * clinic, so a procedure a clinic adds is recognised too. English only until V9 adds locales.
 */

export const EN_FINDINGS: Record<FindingCode, string[]> = {
  sound: ['sound'],
  caries: ['caries', 'decay'],
  restoration: ['restoration'],
  fracture: ['fracture'],
  watch: ['watch'],
  missing: ['missing'],
  crown: ['crown'],
  root_canal_treated: ['root canal treated'],
  implant: ['implant'],
  impacted: ['impacted'],
  mobility: ['mobility'],
};

export const EN_DIAGNOSES: Record<Exclude<DiagnosisCode, 'other'>, string[]> = {
  caries_enamel: ['enamel caries'],
  caries_dentine: ['dentine caries'],
  reversible_pulpitis: ['reversible pulpitis'],
  irreversible_pulpitis: ['irreversible pulpitis'],
  pulp_necrosis: ['pulp necrosis'],
  apical_periodontitis: ['apical periodontitis'],
  apical_abscess: ['apical abscess'],
  cracked_tooth: ['cracked tooth'],
  tooth_wear: ['tooth wear', 'attrition', 'erosion'],
  dentine_hypersensitivity: ['dentine hypersensitivity'],
  gingivitis: ['gingivitis'],
  periodontitis: ['periodontitis'],
  pericoronitis: ['pericoronitis'],
};

export const EN_SURFACES: Record<Surface, string[]> = {
  M: ['mesial'],
  O: ['occlusal'],
  I: ['incisal'],
  D: ['distal'],
  B: ['buccal', 'facial'],
  L: ['lingual', 'palatal'],
};

export const EN_SITES: Record<PerioSite, string[]> = {
  MB: ['mesiobuccal'],
  B: ['buccal'],
  DB: ['distobuccal'],
  ML: ['mesiolingual'],
  L: ['lingual'],
  DL: ['distolingual'],
};

const EN_GENERAL = [
  // "Tooth sixteen" is heard as "two sixteen" in noise without it.
  'tooth',
  'pocket depth',
  'probing',
  'bleeding',
  'millimetres',
  'molar',
  'premolar',
  'incisor',
  'canine',
  'quadrant',
];

/**
 * Everyday words that recognition gets right anyway. As keyterms they only pull ordinary speech
 * towards dental readings ("pull", "post", "watch"), so they are left out; they stay in the
 * vocabulary the benchmark scores.
 */
// prettier-ignore
const COMMON_WORDS = new Set([
  'sound', 'watch', 'missing', 'decay', 'bleeding', 'pull', 'extract', 'post', 'partial',
  'exam', 'check-up', 'checkup', 'cap', 'bridge', 'cleaning', 'x-ray', 'filling', 'crown',
  'implant', 'erosion', 'facial',
]);

export interface VocabularyProcedure {
  name: string;
  aliases: string[];
}

/** Deepgram nova-3 keyterm prompting allows about 500 tokens; stay well inside it. */
export const MAX_KEYTERMS = 100;
const MAX_WORDS = 300;

/** "Root canal treatment, molar" is said as "root canal treatment": drop the qualifier. */
const spoken = (name: string) => name.split(',')[0]!.trim();

/**
 * Clinical terms first, then procedure names, then their aliases; no duplicates, initials or
 * everyday words. `forScoring` keeps everything, for the benchmark's critical words.
 */
export function buildKeyterms(
  procedures: VocabularyProcedure[],
  max = MAX_KEYTERMS,
  forScoring = false
): string[] {
  const ordered = [
    ...Object.values(EN_FINDINGS).flat(),
    ...Object.values(EN_DIAGNOSES).flat(),
    ...Object.values(EN_SURFACES).flat(),
    ...Object.values(EN_SITES).flat(),
    ...EN_GENERAL,
    ...procedures.map((procedure) => spoken(procedure.name)),
    ...procedures.flatMap((procedure) => procedure.aliases),
  ];
  const seen = new Set<string>();
  const terms: string[] = [];
  let words = 0;
  for (const raw of ordered) {
    const term = raw.trim().replace(/\s+/g, ' ');
    const key = term.toLowerCase();
    // Initials such as "PA" or "RCT" bias towards false matches in ordinary speech.
    if (term.length < 4 || /^[A-Z]{2,}$/.test(term) || seen.has(key)) continue;
    if (!forScoring && COMMON_WORDS.has(key)) continue;
    const count = term.split(' ').length;
    if (terms.length >= max || words + count > MAX_WORDS) break;
    seen.add(key);
    terms.push(term);
    words += count;
  }
  return terms;
}

/** Every term, uncapped: what the benchmark counts as a critical word. */
export function allTerms(procedures: VocabularyProcedure[]): string[] {
  return buildKeyterms(procedures, Number.POSITIVE_INFINITY, true);
}

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; terms: Promise<string[]> }>();

/** The clinic's keyterms, from its visible catalog; cached for a few minutes. */
export function clinicKeyterms(pool: Pool, clinicId: string): Promise<string[]> {
  const hit = cache.get(clinicId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.terms;
  const terms = withClinic(pool, clinicId, async (client) => {
    const { rows } = await client.query<VocabularyProcedure>(
      `SELECT name, aliases FROM catalog.procedure_types WHERE active ORDER BY clinic_id NULLS LAST, name`
    );
    return buildKeyterms(rows);
  });
  cache.set(clinicId, { at: Date.now(), terms });
  terms.catch(() => cache.delete(clinicId));
  return terms;
}
