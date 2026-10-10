/**
 * Spoken numbers and units (V5): "three two four", "twenty six", "6mm", "six millimetres".
 * Speech recognition may write numbers as words or digits, so both are read.
 */

const UNITS: Record<string, number> = {
  zero: 0,
  oh: 0,
  no: 0,
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

export const tokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/(\d)\s*(mm|millimet(re|er)s?)\b/g, '$1 mm')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** One number from words or digits, such as "twenty six" or "26"; null if it is not one. */
export function parseNumber(text: string): number | null {
  const words = tokens(text).filter((word) => word !== 'number' && word !== 'and');
  if (words.length === 1 && /^\d+$/.test(words[0]!)) return Number(words[0]);
  if (words.length === 1 && words[0]! in UNITS) return UNITS[words[0]!]!;
  if (words.length === 1 && words[0]! in TENS) return TENS[words[0]!]!;
  if (words.length === 2 && words[0]! in TENS && (UNITS[words[1]!] ?? 10) < 10) {
    return TENS[words[0]!]! + UNITS[words[1]!]!;
  }
  return null;
}

/**
 * A run of small numbers, such as probing depths: "three two four" is 3, 2, 4. Twelve stays
 * 12; a digit string too large to be one depth ("324") is read digit by digit.
 */
export function parseSmallNumbers(text: string, max = 20): number[] {
  const out: number[] = [];
  const words = tokens(text);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    if (/^\d+$/.test(word)) {
      const value = Number(word);
      if (value <= max) out.push(value);
      else out.push(...word.split('').map(Number));
    } else if (word in TENS && words[i + 1] !== undefined && (UNITS[words[i + 1]!] ?? 10) < 10) {
      out.push(TENS[word]! + UNITS[words[i + 1]!]!);
      i += 1;
    } else if (word in UNITS && word !== 'no') {
      out.push(UNITS[word]!);
    }
  }
  return out;
}
