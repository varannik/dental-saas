import { describe, expect, it } from 'vitest';
import { parseTooth } from '../tooth.js';
import { parseNumber, parseSmallNumbers } from './numbers.js';
import { ordinal } from './patient.js';
import { parseReadings } from './perio.js';
import { parseSurfaces } from './surfaces.js';
import { allergySeverity, diagnosisCode, findingCode, historyKind } from './terms.js';

describe('tooth by the clinic notation (V5 acceptance)', () => {
  it('reads "tooth sixteen" as FDI 16 in an FDI clinic and as Universal 16 (FDI 28) in a Universal one', () => {
    expect(parseTooth('tooth sixteen', 'FDI')).toBe('16');
    expect(parseTooth('tooth sixteen', 'Universal')).toBe('28');
    expect(parseTooth('16', 'Universal')).toBe('28');
    expect(parseTooth('number three', 'Universal')).toBe('16');
    expect(parseTooth('thirty two', 'Universal')).toBe('48');
  });

  it('reads a description the same in every notation', () => {
    for (const notation of ['FDI', 'Universal', 'Palmer'] as const) {
      expect(parseTooth('upper right first molar', notation)).toBe('16');
      expect(parseTooth('lower left third molar', notation)).toBe('38');
    }
  });

  it('refuses what is not a tooth in the notation', () => {
    expect(parseTooth('nineteen', 'FDI')).toBeNull();
    expect(parseTooth('thirty three', 'Universal')).toBeNull();
    expect(parseTooth('sixteen', 'Palmer')).toBeNull();
  });
});

describe('numbers', () => {
  it('reads words and digits', () => {
    expect(parseNumber('twenty six')).toBe(26);
    expect(parseNumber('26')).toBe(26);
    expect(parseNumber('number three')).toBe(3);
    expect(parseNumber('crown')).toBeNull();
  });

  it('reads a run of depths, splitting digit strings too large for one', () => {
    expect(parseSmallNumbers('three two four')).toEqual([3, 2, 4]);
    expect(parseSmallNumbers('3, 2, 4')).toEqual([3, 2, 4]);
    expect(parseSmallNumbers('324')).toEqual([3, 2, 4]);
    expect(parseSmallNumbers('twelve')).toEqual([12]);
    expect(parseSmallNumbers('6mm')).toEqual([6]);
  });
});

describe('surfaces', () => {
  it('reads names and letters, and checks them against the tooth', () => {
    expect(parseSurfaces('mesial and occlusal', '46')).toEqual({ surfaces: ['M', 'O'] });
    expect(parseSurfaces('MOD', '46')).toEqual({ surfaces: ['M', 'O', 'D'] });
    expect(parseSurfaces('buccal surface', '15')).toEqual({ surfaces: ['B'] });
    expect(parseSurfaces('labial', '11')).toEqual({ surfaces: ['B'] });
    expect(parseSurfaces('palatal', '21')).toEqual({ surfaces: ['L'] });
    expect(parseSurfaces('occlusal', '11')).toEqual({ problem: 'Tooth 11 has no O surface.' });
    expect(parseSurfaces('the whole thing', '11')).toBeNull();
  });
});

describe('clinical terms', () => {
  it('maps findings, on whole words', () => {
    expect(findingCode('caries')).toBe('caries');
    expect(findingCode('decay')).toBe('caries');
    expect(findingCode('root canal treated')).toBe('root_canal_treated');
    expect(findingCode('a crack')).toBe('fracture');
    expect(findingCode('gold')).toBeNull();
  });

  it('never reads irreversible pulpitis as reversible', () => {
    expect(diagnosisCode('irreversible pulpitis')).toEqual({ code: 'irreversible_pulpitis' });
    expect(diagnosisCode('reversible pulpitis')).toEqual({ code: 'reversible_pulpitis' });
    expect(diagnosisCode('apical abscess')).toEqual({ code: 'apical_abscess' });
    expect(diagnosisCode('bruxism')).toEqual({ code: 'other', label: 'bruxism' });
  });

  it('maps history kinds and allergy severity', () => {
    expect(historyKind('allergy')).toBe('allergy');
    expect(historyKind('risk factor')).toBe('risk_factor');
    expect(historyKind('medication')).toBe('medication');
    expect(historyKind('banana')).toBeNull();
    expect(allergySeverity('severe')).toBe('severe');
    expect(allergySeverity('quite bad')).toBeNull();
  });
});

describe('probing', () => {
  it('fills the buccal sites from three depths, and all six from six', () => {
    expect(parseReadings('three two four', 'mesiobuccal')).toEqual({
      readings: [
        { site: 'MB', pocketDepth: 3, bleeding: true },
        { site: 'B', pocketDepth: 2, bleeding: false },
        { site: 'DB', pocketDepth: 4, bleeding: false },
      ],
    });
    const six = parseReadings('3 2 4 3 3 5', 'all');
    expect(
      'readings' in six &&
        six.readings.map((r) => `${r.site}${r.pocketDepth}${r.bleeding ? '*' : ''}`)
    ).toEqual(['MB3*', 'B2*', 'DB4*', 'ML3*', 'L3*', 'DL5*']);
  });

  it('applies a named site to its depth', () => {
    expect(parseReadings('distolingual six millimetres', undefined)).toEqual({
      readings: [{ site: 'DL', pocketDepth: 6, bleeding: false }],
    });
    expect(parseReadings('mesio buccal 5, disto buccal 4', 'disto-buccal')).toEqual({
      readings: [
        { site: 'MB', pocketDepth: 5, bleeding: false },
        { site: 'DB', pocketDepth: 4, bleeding: true },
      ],
    });
  });

  it('says what is wrong instead of guessing', () => {
    expect(parseReadings('three two', undefined)).toEqual({
      problem: '2 depths were heard; say three (buccal) or six.',
    });
    expect(parseReadings('nothing', undefined)).toEqual({ problem: 'No probing depth was heard.' });
    expect(parseReadings('buccal', undefined)).toEqual({
      problem: 'No depth was said for buccal.',
    });
  });
});

describe('patient list positions', () => {
  it('reads "the second one", "number two" and "last"', () => {
    expect(ordinal('the second one')).toBe(2);
    expect(ordinal('number two')).toBe(2);
    expect(ordinal('3')).toBe(3);
    expect(ordinal('the last one')).toBe(-1);
    expect(ordinal('Sara Ahmed')).toBeNull();
  });
});
