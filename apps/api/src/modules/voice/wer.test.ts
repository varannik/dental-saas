import { describe, expect, it } from 'vitest';
import { align, criticalWords, normalize, rates, score } from './wer.js';

describe('normalize', () => {
  it('compares numbers digit by digit, however they were written', () => {
    expect(normalize('Tooth sixteen')).toEqual(['tooth', '1', '6']);
    expect(normalize('tooth 16.')).toEqual(['tooth', '1', '6']);
    expect(normalize('tooth one six')).toEqual(['tooth', '1', '6']);
    expect(normalize('Forty six')).toEqual(['4', '6']);
    expect(normalize('twenty')).toEqual(['2', '0']);
    expect(normalize('three, two, four')).toEqual(['3', '2', '4']);
  });

  it('ignores case, punctuation, fillers and spelling variants', () => {
    expect(normalize('Um, Generalised gingivitis!')).toEqual(['generalized', 'gingivitis']);
    expect(normalize('six millimetres')).toEqual(normalize('6mm'));
    expect(normalize('mesio-buccal')).toEqual(['mesiobuccal']);
    expect(normalize('Mesio buccal')).toEqual(['mesiobuccal']);
    expect(normalize("patient's")).toEqual(['patients']);
  });
});

describe('align and score', () => {
  it('counts substitutions, deletions and insertions', () => {
    const { distance, edits } = align(['a', 'b', 'c'], ['a', 'x', 'c', 'd']);
    expect(distance).toBe(2);
    expect(edits).toEqual(['match', 'substitution', 'match', 'insertion']);
    expect(align([], ['a']).distance).toBe(1);
    expect(align(['a'], []).distance).toBe(1);
  });

  it('scores critical words: digits and dental vocabulary', () => {
    const critical = criticalWords(['Irreversible pulpitis', 'Occlusal']);
    expect([...critical].sort()).toEqual(['irreversible', 'occlusal', 'pulpitis']);
    const result = score(
      'Diagnosis irreversible pulpitis on sixteen',
      'diagnosis reversible pulpitis on 60',
      critical
    );
    // irreversible→reversible, and tooth 16 heard as 60: both digits wrong, a different tooth.
    expect(result).toEqual({ referenceWords: 6, errors: 3, criticalWords: 4, criticalErrors: 3 });
    expect(
      score('Tooth sixteen occlusal caries', 'tooth 16 occlusal caries', critical).errors
    ).toBe(0);
  });

  it('aggregates over utterances', () => {
    const totals = rates([
      { referenceWords: 10, errors: 1, criticalWords: 4, criticalErrors: 0 },
      { referenceWords: 10, errors: 3, criticalWords: 6, criticalErrors: 1 },
    ]);
    expect(totals.wer).toBeCloseTo(0.2);
    expect(totals.criticalErrorRate).toBeCloseTo(0.1);
  });
});
