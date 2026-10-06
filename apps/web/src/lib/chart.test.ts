import type { ChartEntry } from '@dental/contracts';
import { describe, expect, it } from 'vitest';
import { describeTooth, surfaceLayout, toothView } from './chart';

describe('surfaceLayout', () => {
  it('puts mesial towards the midline and buccal outwards', () => {
    // Upper right first molar, drawn on the viewer's left: midline to the right.
    expect(surfaceLayout('16')).toEqual({
      top: 'B',
      bottom: 'L',
      left: 'D',
      right: 'M',
      center: 'O',
    });
    // Upper left central incisor: midline to the left, incisal edge in the centre.
    expect(surfaceLayout('21')).toEqual({
      top: 'B',
      bottom: 'L',
      left: 'M',
      right: 'D',
      center: 'I',
    });
    // Lower left first molar: buccal faces down.
    expect(surfaceLayout('36')).toMatchObject({ top: 'L', bottom: 'B', left: 'M', right: 'D' });
    // Lower right canine.
    expect(surfaceLayout('43')).toMatchObject({ left: 'D', right: 'M', center: 'I' });
  });
});

describe('toothView', () => {
  const entry = (tooth: string, surface: ChartEntry['surface'], state: string): ChartEntry => ({
    tooth,
    surface,
    state,
    findingId: 'f',
    updatedAt: '2026-10-06T00:00:00.000Z',
  });

  it('splits whole-tooth and surface states for one tooth', () => {
    const entries = [
      entry('16', null, 'crown'),
      entry('16', 'M', 'caries'),
      entry('16', 'O', 'restoration'),
      entry('26', null, 'missing'),
    ];
    expect(toothView(entries, '16')).toEqual({
      tooth: 'crown',
      surfaces: { M: 'caries', O: 'restoration' },
    });
    expect(toothView(entries, '11')).toEqual({ tooth: null, surfaces: {} });
    expect(describeTooth('16', toothView(entries, '16'), (code) => code)).toBe(
      'Tooth 16, crown, caries M, restoration O'
    );
  });
});
