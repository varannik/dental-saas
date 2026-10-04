/**
 * Parses a spoken or typed tooth reference into a tooth code in the clinic's notation.
 * Only FDI is implemented; it is the default notation (spec section Q, decision 10).
 */

export type ToothNotation = 'FDI';

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
};

const TEENS: Record<string, number> = {
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
};

const ARCH: Record<string, 'upper' | 'lower'> = {
  upper: 'upper',
  maxillary: 'upper',
  top: 'upper',
  lower: 'lower',
  mandibular: 'lower',
  bottom: 'lower',
};

/** Tooth position from the midline, permanent dentition. */
const POSITIONS: [RegExp, number][] = [
  [/\bcentral( incisor)?\b/, 1],
  [/\blateral( incisor)?\b/, 2],
  [/\b(canine|cuspid|eye tooth)\b/, 3],
  [/\bfirst (pre ?molar|bicuspid)\b/, 4],
  [/\bsecond (pre ?molar|bicuspid)\b/, 5],
  [/\b(third molar|wisdom( tooth)?)\b/, 8],
  [/\bfirst molar\b/, 6],
  [/\bsecond molar\b/, 7],
];

export function isValidFdi(code: string): boolean {
  if (!/^\d\d$/.test(code)) return false;
  const quadrant = Number(code[0]);
  const tooth = Number(code[1]);
  if (quadrant >= 1 && quadrant <= 4) return tooth >= 1 && tooth <= 8;
  if (quadrant >= 5 && quadrant <= 8) return tooth >= 1 && tooth <= 5;
  return false;
}

function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[#.,]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b(tooth|teeth|number|on|the|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digitOf(token: string): number | undefined {
  if (/^\d$/.test(token)) return Number(token);
  return UNITS[token];
}

function numericCode(text: string): string | undefined {
  if (/^\d\d$/.test(text)) return text;
  const tokens = text.split(' ');
  if (tokens.length === 1) {
    const token = tokens[0]!;
    if (TEENS[token] !== undefined) return String(TEENS[token]);
    return undefined;
  }
  if (tokens.length === 2) {
    const [first, second] = tokens as [string, string];
    const tens = TENS[first];
    const unit = digitOf(second);
    if (tens !== undefined && unit !== undefined && unit > 0) return String(tens + unit);
    const a = digitOf(first);
    if (a !== undefined && unit !== undefined) return `${a}${unit}`;
  }
  return undefined;
}

function descriptiveCode(text: string): string | undefined {
  const arch = text
    .split(' ')
    .map((token) => ARCH[token])
    .find(Boolean);
  const side = /\bright\b/.test(text) ? 'right' : /\bleft\b/.test(text) ? 'left' : undefined;
  if (!arch || !side) return undefined;
  const quadrant = arch === 'upper' ? (side === 'right' ? 1 : 2) : side === 'left' ? 3 : 4;

  for (const [pattern, position] of POSITIONS) {
    if (pattern.test(text)) return `${quadrant}${position}`;
  }
  // "upper right six" or "lower left 7"
  const last = text.split(' ').at(-1)!;
  const position = digitOf(last);
  if (position !== undefined) return `${quadrant}${position}`;
  return undefined;
}

/** Returns the tooth code, or null when the text is not a valid tooth in the notation. */
export function parseTooth(input: string, notation: ToothNotation = 'FDI'): string | null {
  if (notation !== 'FDI') throw new Error(`Unsupported tooth notation: ${notation}`);
  const text = normalise(input);
  if (!text) return null;
  const code = numericCode(text) ?? descriptiveCode(text);
  return code && isValidFdi(code) ? code : null;
}
