import { normalize } from '../wer.js';

/**
 * Whether an entity the model returned was actually said (V4). The prompt tells the model to
 * copy the clinician's words and never to fill an entity from context, but a model can still
 * do it: "occlusal caries" with tooth 16 in focus came back with tooth "16". An entity whose
 * words are not in the utterance is dropped, so nothing taken from context is ever presented as
 * said; using the context openly, and labelled, is the resolver's job (V5).
 *
 * Both sides are normalised as in the speech benchmark, so "sixteen", "16" and "one six" all
 * match, and "mesio-buccal" matches "mesiobuccal".
 */

const FILLER = new Set(['a', 'an', 'the', 'of', 'on', 'for', 'to', 'and', 'in', 'at', 'with']);
/** Words this long that share a stem match, such as "allergic" and "allergy". */
const STEM = 5;

const sameWord = (said: string, word: string) =>
  said === word ||
  (said.length >= STEM && word.length >= STEM && said.slice(0, STEM) === word.slice(0, STEM));

export function isGrounded(value: string, utterance: string): boolean {
  const said = normalize(utterance);
  const words = normalize(value).filter((word) => !FILLER.has(word));
  if (words.length === 0) return false;
  return words.every((word) => said.some((candidate) => sameWord(candidate, word)));
}
