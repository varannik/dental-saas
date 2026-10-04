/**
 * Resolves a spoken procedure name against catalog aliases.
 * The real catalog lives in the database (milestone M1); the spike passes a fixed list.
 */

export interface CatalogProcedure {
  id: string;
  name: string;
  aliases: string[];
  requiresTooth: boolean;
}

export interface ProcedureMatch {
  procedure: CatalogProcedure;
  alias: string;
}

export type ProcedureResolution =
  | { status: 'matched'; match: ProcedureMatch; alternatives: CatalogProcedure[] }
  | { status: 'unknown' };

function normalise(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

/**
 * Finds every procedure with an alias contained in the phrase as whole words.
 * The longest alias wins; other procedures matched by an alias of the same length
 * are returned as alternatives, which marks the result as ambiguous.
 */
export function resolveProcedure(
  phrase: string,
  catalog: readonly CatalogProcedure[]
): ProcedureResolution {
  const text = normalise(phrase);
  const matches: ProcedureMatch[] = [];
  for (const procedure of catalog) {
    const candidates = [procedure.name, ...procedure.aliases];
    const best = candidates
      .filter((alias) => text.includes(normalise(alias)))
      .sort((a, b) => b.length - a.length)[0];
    if (best) matches.push({ procedure, alias: best });
  }
  if (matches.length === 0) return { status: 'unknown' };

  matches.sort((a, b) => b.alias.length - a.alias.length);
  const [first, ...rest] = matches as [ProcedureMatch, ...ProcedureMatch[]];
  const alternatives = rest
    .filter((match) => match.alias.length === first.alias.length)
    .map((match) => match.procedure);
  return { status: 'matched', match: first, alternatives };
}
