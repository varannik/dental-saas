import jwt from 'jsonwebtoken';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createEncounter: vi.fn(),
  getEncounter: vi.fn(),
  checkInEncounter: vi.fn(),
  checkOutEncounter: vi.fn(),
  beginEncounterInProgress: vi.fn(),
  createClinicalNote: vi.fn(),
  listClinicalNotesForEncounter: vi.fn(),
  recordClinicalAudit: vi.fn(),
}));

vi.mock('../services/encounter.service.js', () => ({
  createEncounter: mocks.createEncounter,
  getEncounter: mocks.getEncounter,
  checkInEncounter: mocks.checkInEncounter,
  checkOutEncounter: mocks.checkOutEncounter,
  beginEncounterInProgress: mocks.beginEncounterInProgress,
  EncounterNotFoundError: class extends Error {
    statusCode = 404;
    constructor() {
      super('Encounter not found.');
      this.name = 'EncounterNotFoundError';
    }
  },
  EncounterStateError: class extends Error {
    statusCode = 400;
    constructor(m: string) {
      super(m);
      this.name = 'EncounterStateError';
    }
  },
}));

vi.mock('../lib/audit.js', () => ({
  recordClinicalAudit: mocks.recordClinicalAudit,
}));

vi.mock('../services/note.service.js', () => ({
  createClinicalNote: mocks.createClinicalNote,
  listClinicalNotesForEncounter: mocks.listClinicalNotesForEncounter,
}));

import { buildClinicalServiceServer } from '../app.js';

const jwtSecret = 'dev-only-jwt-secret-change-me-immediately';
const jwtIssuer = 'dental-saas';
const tenantId = '11111111-1111-4111-8111-111111111111';
const encounterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const issueToken = (): string =>
  jwt.sign({ userId: 'user-1', tenantId }, jwtSecret, {
    issuer: jwtIssuer,
  });

const auth = { authorization: `Bearer ${issueToken()}` };

describe('routes/encounters', () => {
  const app = buildClinicalServiceServer();

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates encounter', async () => {
    mocks.createEncounter.mockResolvedValue({
      id: encounterId,
      status: 'SCHEDULED',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/encounters',
      headers: auth,
      payload: {
        patientId: '22222222-2222-4222-8222-222222222222',
        locationId: '33333333-3333-4333-8333-333333333333',
        encounterType: 'EXAM',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(mocks.createEncounter).toHaveBeenCalled();
  });

  it('gets encounter by id', async () => {
    mocks.getEncounter.mockResolvedValueOnce({ id: encounterId });
    let response = await app.inject({
      method: 'GET',
      url: `/encounters/${encounterId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);

    mocks.getEncounter.mockResolvedValueOnce(null);
    response = await app.inject({
      method: 'GET',
      url: `/encounters/${encounterId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(404);
  });

  it('lists clinical notes for encounter', async () => {
    mocks.listClinicalNotesForEncounter.mockResolvedValueOnce([{ id: 'n1' }]);
    const response = await app.inject({
      method: 'GET',
      url: `/encounters/${encounterId}/notes`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ notes: [{ id: 'n1' }] });
    expect(mocks.listClinicalNotesForEncounter).toHaveBeenCalledWith(encounterId, tenantId);

    mocks.listClinicalNotesForEncounter.mockResolvedValueOnce(null);
    const missing = await app.inject({
      method: 'GET',
      url: `/encounters/${encounterId}/notes`,
      headers: auth,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('creates clinical note for encounter', async () => {
    mocks.createClinicalNote.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      noteType: 'SOAP',
    });
    const response = await app.inject({
      method: 'POST',
      url: `/encounters/${encounterId}/notes`,
      headers: auth,
      payload: {
        noteType: 'SOAP',
        content: 'Subjective: …',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(mocks.createClinicalNote).toHaveBeenCalled();
  });

  it('check-in and check-out', async () => {
    mocks.checkInEncounter.mockResolvedValue({ id: encounterId, status: 'CHECKED_IN' });
    let response = await app.inject({
      method: 'PATCH',
      url: `/encounters/${encounterId}/check-in`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);

    mocks.beginEncounterInProgress.mockResolvedValue({ id: encounterId, status: 'IN_PROGRESS' });
    response = await app.inject({
      method: 'PATCH',
      url: `/encounters/${encounterId}/in-progress`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);

    mocks.checkOutEncounter.mockResolvedValue({ id: encounterId, status: 'COMPLETED' });
    response = await app.inject({
      method: 'PATCH',
      url: `/encounters/${encounterId}/check-out`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
  });
});
