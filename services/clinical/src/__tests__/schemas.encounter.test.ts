import { describe, expect, it } from 'vitest';

import {
  createEncounterBodySchema,
  listEncountersForPatientQuerySchema,
} from '../schemas/encounter.schema.js';

describe('encounter schemas', () => {
  it('accepts valid create payload', () => {
    const payload = createEncounterBodySchema.parse({
      patientId: '22222222-2222-4222-8222-222222222222',
      locationId: '33333333-3333-4333-8333-333333333333',
      encounterType: 'EXAM',
      scheduledStartAt: '2026-05-01T10:00:00.000Z',
    });
    expect(payload.encounterType).toBe('EXAM');
    expect(payload.scheduledStartAt).toBe('2026-05-01T10:00:00.000Z');
  });

  it('allows null scheduled time', () => {
    const payload = createEncounterBodySchema.parse({
      patientId: '22222222-2222-4222-8222-222222222222',
      locationId: '33333333-3333-4333-8333-333333333333',
      encounterType: 'HYGIENE',
      scheduledStartAt: null,
    });
    expect(payload.scheduledStartAt).toBeNull();
  });

  it('lists query defaults', () => {
    const q = listEncountersForPatientQuerySchema.parse({});
    expect(q.limit).toBe(20);
  });
});
