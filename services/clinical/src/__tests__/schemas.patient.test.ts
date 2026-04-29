import { describe, expect, it } from 'vitest';

import {
  createPatientBodySchema,
  listPatientsQuerySchema,
  searchPatientsQuerySchema,
} from '../schemas/patient.schema.js';

describe('patient schemas', () => {
  it('accepts a valid create payload', () => {
    const payload = createPatientBodySchema.parse({
      firstName: 'Ada',
      lastName: 'Lovelace',
      contactEmail: 'a@example.com',
      dob: '1990-01-15',
    });
    expect(payload.firstName).toBe('Ada');
    expect(payload.status).toBe('ACTIVE');
  });

  it('rejects invalid email', () => {
    expect(() =>
      createPatientBodySchema.parse({
        firstName: 'A',
        lastName: 'B',
        contactEmail: 'not-an-email',
      })
    ).toThrow();
  });

  it('applies list query defaults', () => {
    const q = listPatientsQuerySchema.parse({});
    expect(q.limit).toBe(20);
  });

  it('rejects search with no filters (Zod superRefine)', () => {
    expect(() => searchPatientsQuerySchema.parse({ limit: 10 })).toThrow();
  });

  it('parses search query with dob', () => {
    const q = searchPatientsQuerySchema.parse({
      dob: '2000-12-01',
      limit: 5,
    });
    expect(q.dob).toBe('2000-12-01');
    expect(q.limit).toBe(5);
  });
});
