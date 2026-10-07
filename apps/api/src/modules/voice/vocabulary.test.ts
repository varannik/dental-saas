import { DIAGNOSIS_CODES, FINDING_CODES, PERIO_SITES, SURFACES } from '@dental/contracts';
import { describe, expect, it } from 'vitest';
import {
  allTerms,
  buildKeyterms,
  EN_DIAGNOSES,
  EN_FINDINGS,
  EN_SITES,
  EN_SURFACES,
  MAX_KEYTERMS,
} from './vocabulary.js';

describe('vocabulary', () => {
  it('has a spoken name for every finding, diagnosis, surface and site', () => {
    expect(Object.keys(EN_FINDINGS).sort()).toEqual([...FINDING_CODES].sort());
    expect(Object.keys(EN_DIAGNOSES).sort()).toEqual(
      DIAGNOSIS_CODES.filter((code) => code !== 'other').sort()
    );
    expect(Object.keys(EN_SURFACES).sort()).toEqual([...SURFACES].sort());
    expect(Object.keys(EN_SITES).sort()).toEqual([...PERIO_SITES].sort());
  });

  it('puts clinical terms first, then procedures, without duplicates or initials', () => {
    const terms = buildKeyterms([
      { name: 'Root canal treatment, molar', aliases: ['root canal', 'RCT', 'endo'] },
      { name: 'Crown', aliases: ['crown', 'cap'] },
      { name: 'Periapical radiograph', aliases: ['PA', 'x-ray'] },
    ]);
    expect(terms[0]).toBe('caries');
    expect(terms).toContain('irreversible pulpitis');
    expect(terms).toContain('tooth');
    // Spoken without the qualifier.
    expect(terms).toContain('Root canal treatment');
    expect(terms).toContain('root canal');
    expect(terms).toContain('Periapical radiograph');
    expect(terms).not.toContain('RCT');
    expect(terms).not.toContain('PA');
    // Everyday words are recognised anyway and would only bias ordinary speech.
    expect(terms).not.toContain('cap');
    expect(terms).not.toContain('x-ray');
    expect(terms.map((term) => term.toLowerCase())).not.toContain('crown');
  });

  it('scores every term, everyday words included', () => {
    const scored = allTerms([{ name: 'Crown', aliases: ['cap'] }]);
    expect(scored.map((term) => term.toLowerCase())).toContain('crown');
    expect(scored).toContain('missing');
  });

  it('stays within the provider limit however large the catalog', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      name: `Procedure number ${i}`,
      aliases: [`alias number ${i}`],
    }));
    const terms = buildKeyterms(many);
    expect(terms.length).toBeLessThanOrEqual(MAX_KEYTERMS);
    expect(terms.join(' ').split(' ').length).toBeLessThanOrEqual(300);
  });
});
