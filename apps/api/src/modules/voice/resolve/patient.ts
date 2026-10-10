import type { VoiceContext } from '@dental/contracts';
import type { PoolClient } from '../../../platform/db.js';
import { searchPatients, type PatientHit } from '../../patients/search.js';
import { parseNumber, tokens } from './numbers.js';

/**
 * Patients by voice (V5): a spoken name, searched as typed names are (spelling and sound), or
 * "the second one" from the list last shown. Opening a patient is risk R1, so the result is
 * always confirmed with the full name and a second identifier, and several plausible matches
 * become a numbered list rather than a guess.
 */

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  last: -1,
};

/** "the second one", "number two", "2": a position in the last list, from 1; null otherwise. */
export function ordinal(text: string): number | null {
  const words = tokens(text).filter((word) => !['the', 'one', 'please', 'patient'].includes(word));
  if (words.length === 1 && words[0]! in ORDINALS) return ORDINALS[words[0]!]!;
  if (words[0] === 'number' && words.length >= 2) return parseNumber(words.slice(1).join(' '));
  if (words.length === 1 && /^\d$/.test(words[0]!)) return Number(words[0]);
  return null;
}

export type PatientResolution =
  | { status: 'one'; patient: PatientHit }
  | { status: 'several'; candidates: PatientHit[] }
  | { status: 'none' };

/** A score this far ahead of the next one counts as one clear match. */
const CLEAR_LEAD = 0.15;
const LIST_SIZE = 5;

export async function resolvePatient(
  client: PoolClient,
  spoken: string,
  context: Pick<VoiceContext, 'lastListed'>
): Promise<PatientResolution> {
  const position = ordinal(spoken);
  if (position !== null && context.lastListed?.kind === 'patients') {
    const ids = context.lastListed.ids;
    const id = position === -1 ? ids.at(-1) : ids[position - 1];
    if (!id) return { status: 'none' };
    const { rows } = await client.query<PatientHit>(
      `SELECT id, file_number AS "fileNumber", given_name AS "givenName", family_name AS "familyName",
              birth_date::text AS "birthDate", sex, phone, status, 1::float AS score
       FROM clinical.patients WHERE id = $1`,
      [id]
    );
    return rows[0] ? { status: 'one', patient: rows[0] } : { status: 'none' };
  }
  const hits = await searchPatients(client, spoken, { limit: LIST_SIZE });
  if (hits.length === 0) return { status: 'none' };
  const [best, next] = hits;
  if (!next || best!.score - next.score >= CLEAR_LEAD) return { status: 'one', patient: best! };
  return { status: 'several', candidates: hits };
}
