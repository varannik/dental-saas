import { describe, expect, it } from 'vitest';

import {
  createTreatmentPlanBodySchema,
  createTreatmentPlanItemBodySchema,
  updateTreatmentPlanItemBodySchema,
} from '../schemas/treatment-plan.schema.js';

describe('schemas/treatment-plan', () => {
  it('parses create plan', () => {
    const p = createTreatmentPlanBodySchema.parse({ title: 'Full mouth' });
    expect(p.title).toBe('Full mouth');
  });

  it('parses create item', () => {
    const i = createTreatmentPlanItemBodySchema.parse({
      cdtCode: 'D0120',
      estimatedFee: 120.5,
    });
    expect(i.cdtCode).toBe('D0120');
  });

  it('rejects empty item patch', () => {
    expect(() => updateTreatmentPlanItemBodySchema.parse({})).toThrow();
  });
});
