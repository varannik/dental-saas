import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabaseConnection: vi.fn(),
}));

vi.mock('@saas/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@saas/config')>();
  return {
    ...actual,
    createDatabaseConnection: mocks.createDatabaseConnection,
  };
});

import {
  createPatient,
  getPatient,
  getPatientHistory,
  listPatients,
  searchPatients,
  softDeletePatient,
  toPatientResponse,
  updatePatient,
} from '../services/patient.service.js';
import { createPatientBodySchema } from '../schemas/patient.schema.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const past = new Date('2020-01-15T10:00:00.000Z');

const fullRow = {
  id: patientId,
  tenantId,
  primaryLocationId: null,
  firstName: 'J',
  lastName: 'D',
  dob: '1990-05-20',
  sexAtBirth: null,
  genderIdentity: null,
  contactEmail: 'j@example.com',
  phoneMobile: '555',
  phoneHome: null,
  preferredLocale: null,
  preferredLanguage: null,
  preferredContactMethod: null,
  status: 'ACTIVE',
  createdAt: past,
  updatedAt: past,
};

describe('patient.service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('toPatientResponse maps row for API', () => {
    const out = toPatientResponse(fullRow as Parameters<typeof toPatientResponse>[0]);
    expect(out.dob).toBe('1990-05-20');
    expect(out.id).toBe(patientId);
  });

  it('listPatients returns page and null cursor when not full', async () => {
    const row = { ...fullRow, createdAt: past, id: '33333333-3333-4333-8333-333333333333' };
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([row]),
            })),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const r = await listPatients(tenantId, { limit: 20, cursor: undefined, q: undefined });
    expect(r.patients).toHaveLength(1);
    expect(r.nextCursor).toBeNull();
  });

  it('listPatients returns nextCursor when more than page', async () => {
    const a = { ...fullRow, id: 'a0000000-0000-4000-8000-0000000000a0', createdAt: past };
    const b = {
      ...fullRow,
      id: 'b0000000-0000-4000-8000-0000000000b0',
      createdAt: new Date('2019-01-01T00:00:00.000Z'),
    };
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([a, b]),
            })),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const r = await listPatients(tenantId, { limit: 1, cursor: undefined, q: undefined });
    expect(r.patients).toHaveLength(1);
    expect(r.nextCursor).toBeTypeOf('string');
  });

  it('listPatients throws invalid cursor when payload shape is wrong', async () => {
    const bad = Buffer.from(JSON.stringify({ t: 1, i: 'x' }), 'utf8').toString('base64url');
    await expect(listPatients(tenantId, { limit: 20, cursor: bad, q: undefined })).rejects.toThrow(
      'Invalid cursor'
    );
  });

  it('getPatient returns null when not found', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const r = await getPatient(patientId, tenantId);
    expect(r).toBeNull();
  });

  it('getPatient returns mapped row', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([fullRow]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const r = await getPatient(patientId, tenantId);
    expect(r?.id).toBe(patientId);
  });

  it('createPatient inserts and returns map', async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fullRow]),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const input = createPatientBodySchema.parse({ firstName: 'J', lastName: 'D' });
    const r = await createPatient(tenantId, input);
    expect(r.id).toBe(patientId);
  });

  it('updatePatient with empty patch delegates to get', async () => {
    const getDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([fullRow]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(getDb);
    const r = await updatePatient(patientId, tenantId, {});
    expect(r?.id).toBe(patientId);
  });

  it('updatePatient mutates and returns', async () => {
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ ...fullRow, firstName: 'New' }]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const r = await updatePatient(patientId, tenantId, { firstName: 'New' });
    expect((r as { firstName: string }).firstName).toBe('New');
  });

  it('softDeletePatient returns true when row updated', async () => {
    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: patientId }]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const ok = await softDeletePatient(patientId, tenantId);
    expect(ok).toBe(true);
  });

  it('getPatientHistory returns null when patient missing', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const r = await getPatientHistory(patientId, tenantId);
    expect(r).toBeNull();
  });

  it('getPatientHistory maps encounters and notes for API stability', async () => {
    const select = vi
      .fn()
      // patient exists
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: patientId }]),
          }),
        }),
      })
      // encounters
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([{ id: 'e1' }]),
          }),
        }),
      })
      // notes
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([{ id: 'n1' }]),
          }),
        }),
      });
    const db = { select };
    mocks.createDatabaseConnection.mockReturnValue(db);
    const r = await getPatientHistory(patientId, tenantId);
    expect(r?.encounters).toHaveLength(1);
    expect(r?.notes).toHaveLength(1);
    expect(r?.encounters[0]).toMatchObject({ id: 'e1' });
    expect(r?.notes[0]).toMatchObject({ id: 'n1' });
  });

  it('searchPatients uses exact lastName+dob path when only those filters are set', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    await searchPatients(tenantId, {
      lastName: 'Doe',
      dob: '1990-05-20',
      limit: 10,
    });
    expect(db.select).toHaveBeenCalled();
  });

  it('searchPatients uses filters', async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    };
    mocks.createDatabaseConnection.mockReturnValue(db);
    await searchPatients(tenantId, {
      lastName: 'Doe',
      limit: 10,
    });
    expect(db.select).toHaveBeenCalled();
  });
});
