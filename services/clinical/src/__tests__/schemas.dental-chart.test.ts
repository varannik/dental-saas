import { describe, expect, it } from 'vitest';

import {
  createDentalChartEntryBodySchema,
  universalToothNumberSchema,
  updateDentalChartEntryBodySchema,
} from '../schemas/dental-chart.schema.js';

describe('schemas/dental-chart', () => {
  it('accepts universal teeth 1–32', () => {
    expect(universalToothNumberSchema.safeParse('1').success).toBe(true);
    expect(universalToothNumberSchema.safeParse('32').success).toBe(true);
    expect(universalToothNumberSchema.safeParse('33').success).toBe(false);
    expect(universalToothNumberSchema.safeParse('00').success).toBe(false);
  });

  it('accepts create body', () => {
    const p = createDentalChartEntryBodySchema.parse({
      toothNumber: '14',
      condition: 'CARIES',
      surface: 'M',
    });
    expect(p.toothNumber).toBe('14');
  });

  it('requires at least one field on patch', () => {
    expect(() => updateDentalChartEntryBodySchema.parse({})).toThrow();
  });
});
