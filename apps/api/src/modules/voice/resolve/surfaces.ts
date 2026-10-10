import { surfacesOf, type Surface } from '@dental/contracts';
import { tokens } from './numbers.js';

/**
 * Spoken surfaces (V5): "mesial and occlusal", "MO", "M O D", "buccal surface". Facial and
 * labial mean buccal; palatal means lingual. Checked against the tooth: an incisor has an
 * incisal edge, not an occlusal surface.
 */

const WORDS: Record<string, Surface> = {
  mesial: 'M',
  occlusal: 'O',
  incisal: 'I',
  distal: 'D',
  buccal: 'B',
  facial: 'B',
  labial: 'B',
  lingual: 'L',
  palatal: 'L',
};
const LETTERS = new Set<string>(['M', 'O', 'I', 'D', 'B', 'L']);

export type SurfaceResult = { surfaces: Surface[] } | { problem: string };

export function parseSurfaces(text: string, tooth: string | null): SurfaceResult | null {
  const found: Surface[] = [];
  for (const word of tokens(text)) {
    if (word in WORDS) found.push(WORDS[word]!);
    else if (/^[modbli]{1,5}$/.test(word) && [...word.toUpperCase()].every((c) => LETTERS.has(c))) {
      found.push(...([...word.toUpperCase()] as Surface[]));
    }
  }
  const surfaces = [...new Set(found)];
  if (surfaces.length === 0) return null;
  if (tooth) {
    const allowed = surfacesOf(tooth);
    const wrong = surfaces.filter((surface) => !allowed.includes(surface));
    if (wrong.length) return { problem: `Tooth ${tooth} has no ${wrong.join(', ')} surface.` };
  }
  return { surfaces };
}
