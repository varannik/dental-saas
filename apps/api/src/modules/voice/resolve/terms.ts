import {
  ALLERGY_SEVERITIES,
  type AllergySeverity,
  type DiagnosisCode,
  type FindingCode,
  type HistoryKind,
} from '@dental/contracts';
import { EN_DIAGNOSES, EN_FINDINGS } from '../vocabulary.js';
import { tokens } from './numbers.js';

/**
 * Spoken clinical terms to codes (V5), using the same spoken names that bias recognition, so
 * what can be heard can be resolved. The longest matching name wins, on whole words, so
 * "irreversible pulpitis" is never read as "reversible pulpitis".
 */

const EXTRA_FINDINGS: Record<string, FindingCode> = {
  cavity: 'caries',
  filling: 'restoration',
  crack: 'fracture',
  cracked: 'fracture',
  rct: 'root_canal_treated',
  'root filled': 'root_canal_treated',
  mobile: 'mobility',
  absent: 'missing',
  extracted: 'missing',
};

function longestMatch<Code extends string>(text: string, names: [string, Code][]): Code | null {
  const said = ` ${tokens(text).join(' ')} `;
  const hit = names
    .filter(([name]) => said.includes(` ${tokens(name).join(' ')} `))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : null;
}

export function findingCode(text: string): FindingCode | null {
  const names: [string, FindingCode][] = [
    ...Object.entries(EN_FINDINGS).flatMap(([code, spoken]) =>
      spoken.map((name): [string, FindingCode] => [name, code as FindingCode])
    ),
    ...(Object.entries(EXTRA_FINDINGS) as [string, FindingCode][]),
  ];
  return longestMatch(text, names);
}

/** A listed diagnosis, or "other" with the words as its label. */
export function diagnosisCode(text: string): { code: DiagnosisCode; label?: string } {
  const names: [string, DiagnosisCode][] = Object.entries(EN_DIAGNOSES).flatMap(([code, spoken]) =>
    spoken.map((name): [string, DiagnosisCode] => [name, code as DiagnosisCode])
  );
  const code = longestMatch(text, names);
  return code ? { code } : { code: 'other', label: text.trim() };
}

const KINDS: Record<string, HistoryKind> = {
  condition: 'condition',
  disease: 'condition',
  illness: 'condition',
  medication: 'medication',
  medicine: 'medication',
  drug: 'medication',
  allergy: 'allergy',
  allergic: 'allergy',
  risk: 'risk_factor',
  smoker: 'risk_factor',
  smoking: 'risk_factor',
};

export function historyKind(text: string): HistoryKind | null {
  for (const word of tokens(text)) if (word in KINDS) return KINDS[word]!;
  return null;
}

export function allergySeverity(text: string): AllergySeverity | null {
  const words = tokens(text);
  return ALLERGY_SEVERITIES.find((severity) => words.includes(severity)) ?? null;
}
