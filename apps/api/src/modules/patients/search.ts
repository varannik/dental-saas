import type { PatientHit } from '@dental/contracts';
import type { PoolClient } from '../../platform/db.js';

/**
 * Patient search for typed and spoken names (spec section E): trigram similarity on the
 * normalised name, Double Metaphone codes for Latin-script names, and phone and file numbers.
 * Scores run from 0 to 1; weak matches are left out.
 */

export type { PatientHit };

const MIN_SCORE = 0.3;

export async function searchPatients(
  client: PoolClient,
  query: string,
  options: { limit: number; includeArchived?: boolean }
): Promise<PatientHit[]> {
  const digits = query.replace(/\D/g, '');
  const { rows } = await client.query<{
    id: string;
    file_number: number;
    given_name: string;
    family_name: string;
    birth_date: string;
    sex: string;
    phone: string | null;
    status: string;
    score: number;
  }>(
    `WITH q AS (
       SELECT clinical.normalize_name($1) AS text,
              clinical.phonetic_tokens($1) AS phon,
              nullif($2, '') AS digits
     ),
     scored AS (
       SELECT p.*, greatest(
         similarity(p.search_name, q.text),
         word_similarity(q.text, p.search_name),
         -- Sounds alike: from 0.6 when one spoken word matches to 0.9 when all do.
         CASE WHEN cardinality(q.phon) > 0 AND p.phonetic_tokens && q.phon THEN
           0.6 + 0.3 * (SELECT count(*) FROM unnest(q.phon) AS code
                        WHERE code = ANY (p.phonetic_tokens))::float / cardinality(q.phon)
         ELSE 0 END,
         CASE WHEN length(q.digits) >= 4 AND p.phone_digits LIKE '%' || q.digits || '%'
           THEN 0.95 ELSE 0 END,
         CASE WHEN p.file_number::text = q.digits THEN 1 ELSE 0 END
       ) AS score
       FROM clinical.patients AS p, q
       WHERE $4 OR p.status = 'active'
     )
     SELECT id, file_number, given_name, family_name, birth_date, sex, phone, status,
            round(score::numeric, 3)::float AS score
     FROM scored
     WHERE score >= $5
     ORDER BY score DESC, family_name, given_name
     LIMIT $3`,
    [query, digits, options.limit, options.includeArchived ?? false, MIN_SCORE]
  );
  return rows.map((row) => ({
    id: row.id,
    fileNumber: row.file_number,
    givenName: row.given_name,
    familyName: row.family_name,
    birthDate: row.birth_date,
    sex: row.sex,
    phone: row.phone,
    status: row.status,
    score: row.score,
  }));
}
