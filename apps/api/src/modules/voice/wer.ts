/**
 * Word error rate for the speech benchmark (V2, ADR 0005). Transcripts are normalised first,
 * so formatting the speech provider chooses ("16" or "sixteen", "mesio-buccal") is not counted
 * as an error; numbers compare digit by digit, so "sixteen", "16" and "one six" are equal.
 */

const UNITS: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** British and American spellings, units and compounds that mean the same word. */
const SPELLINGS: Record<string, string> = {
  generalised: 'generalized',
  localised: 'localized',
  anaesthetic: 'anesthetic',
  anaesthesia: 'anesthesia',
  haemorrhage: 'hemorrhage',
  oedema: 'edema',
  millimetres: 'mm',
  millimeters: 'mm',
  millimetre: 'mm',
  millimeter: 'mm',
  afterwards: 'afterward',
  colour: 'color',
  ok: 'okay',
};

const FILLERS = new Set(['um', 'uh', 'erm', 'er', 'ah', 'hmm']);
/** "mesio buccal" and "mesiobuccal" are one site. */
const SITE_PREFIXES = new Set(['mesio', 'disto']);

export function normalize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/(\d)\s*mm\b/g, '$1 mm')
    .replace(/[‐-―-]/g, ' ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter((word) => word && !FILLERS.has(word))
    .map((word) => SPELLINGS[word] ?? word);

  const joined: string[] = [];
  for (const word of words) {
    const last = joined.at(-1);
    if (last && SITE_PREFIXES.has(last)) joined[joined.length - 1] = last + word;
    else joined.push(word);
  }

  // Number words to digits, combining "forty six" into 46, then every number digit by digit.
  const numbers: string[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    const word = joined[i]!;
    if (word in TENS) {
      const next = joined[i + 1];
      const unit = next !== undefined ? UNITS[next] : undefined;
      if (unit !== undefined && unit > 0 && unit < 10) {
        numbers.push(String(TENS[word]! + unit));
        i += 1;
      } else numbers.push(String(TENS[word]));
    } else if (word in UNITS) numbers.push(String(UNITS[word]));
    else numbers.push(word);
  }
  return numbers.flatMap((word) => (/^\d+$/.test(word) ? word.split('') : [word]));
}

export type Edit = 'match' | 'substitution' | 'deletion' | 'insertion';

/** Minimum-edit alignment; for each reference word, whether it was matched. */
export function align(reference: string[], hypothesis: string[]) {
  const rows = reference.length + 1;
  const cols = hypothesis.length + 1;
  const cost: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const same = reference[i - 1] === hypothesis[j - 1] ? 0 : 1;
      cost[i]![j] = Math.min(
        cost[i - 1]![j - 1]! + same,
        cost[i - 1]![j]! + 1,
        cost[i]![j - 1]! + 1
      );
    }
  }
  const edits: Edit[] = [];
  const matched: boolean[] = new Array<boolean>(reference.length).fill(false);
  let i = reference.length;
  let j = hypothesis.length;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      cost[i]![j] === cost[i - 1]![j - 1]! + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)
    ) {
      const same = reference[i - 1] === hypothesis[j - 1];
      edits.push(same ? 'match' : 'substitution');
      matched[i - 1] = same;
      i -= 1;
      j -= 1;
    } else if (i > 0 && cost[i]![j] === cost[i - 1]![j]! + 1) {
      edits.push('deletion');
      i -= 1;
    } else {
      edits.push('insertion');
      j -= 1;
    }
  }
  return { distance: cost[reference.length]![hypothesis.length]!, edits: edits.reverse(), matched };
}

export interface Score {
  referenceWords: number;
  errors: number;
  criticalWords: number;
  criticalErrors: number;
}

/** Scores one transcript; critical words are digits and the given dental vocabulary. */
export function score(reference: string, hypothesis: string, critical: Set<string>): Score {
  const ref = normalize(reference);
  const { distance, matched } = align(ref, normalize(hypothesis));
  let criticalWords = 0;
  let criticalErrors = 0;
  ref.forEach((word, index) => {
    if (!/^\d$/.test(word) && !critical.has(word)) return;
    criticalWords += 1;
    if (!matched[index]) criticalErrors += 1;
  });
  return { referenceWords: ref.length, errors: distance, criticalWords, criticalErrors };
}

export function rates(scores: Score[]) {
  const sum = (key: keyof Score) => scores.reduce((total, item) => total + item[key], 0);
  return {
    wer: sum('errors') / Math.max(1, sum('referenceWords')),
    criticalErrorRate: sum('criticalErrors') / Math.max(1, sum('criticalWords')),
    referenceWords: sum('referenceWords'),
    criticalWords: sum('criticalWords'),
  };
}

/** The critical words of a vocabulary: every word of every term, normalised. */
export function criticalWords(terms: Iterable<string>): Set<string> {
  const words = new Set<string>();
  const ignore = new Set(['a', 'an', 'and', 'of', 'the', 'on', 'for', 'per', 'or', 'with']);
  for (const term of terms)
    for (const word of normalize(term)) if (!ignore.has(word)) words.add(word);
  return words;
}
