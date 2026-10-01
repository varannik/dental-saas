import { describe, expect, it } from 'vitest';
import { CLINICAL_SCHEMAS, POSTGRES_SCHEMAS, RESEARCH_SCHEMAS } from './schemas.js';

describe('database schemas', () => {
  it('keeps research schemas disjoint from clinical schemas', () => {
    const clinical = new Set<string>(CLINICAL_SCHEMAS);
    for (const schema of RESEARCH_SCHEMAS) {
      expect(clinical.has(schema)).toBe(false);
    }
    expect(new Set(POSTGRES_SCHEMAS).size).toBe(POSTGRES_SCHEMAS.length);
  });
});
