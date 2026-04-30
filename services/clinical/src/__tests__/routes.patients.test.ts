import jwt from 'jsonwebtoken';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPatients: vi.fn(),
  getPatient: vi.fn(),
  createPatient: vi.fn(),
  updatePatient: vi.fn(),
  softDeletePatient: vi.fn(),
  getPatientHistory: vi.fn(),
  searchPatients: vi.fn(),
  listEncountersForPatient: vi.fn(),
  getDentalChartForPatient: vi.fn(),
  createDentalChartEntry: vi.fn(),
  listDentalChartHistory: vi.fn(),
  createTreatmentPlan: vi.fn(),
  listTreatmentPlansForPatient: vi.fn(),
  recordClinicalAudit: vi.fn(),
}));

vi.mock('../services/patient.service.js', () => ({
  listPatients: mocks.listPatients,
  getPatient: mocks.getPatient,
  createPatient: mocks.createPatient,
  updatePatient: mocks.updatePatient,
  softDeletePatient: mocks.softDeletePatient,
  getPatientHistory: mocks.getPatientHistory,
  searchPatients: mocks.searchPatients,
}));

vi.mock('../services/encounter.service.js', () => ({
  listEncountersForPatient: mocks.listEncountersForPatient,
}));

vi.mock('../services/dental-chart.service.js', () => ({
  getDentalChartForPatient: mocks.getDentalChartForPatient,
  createDentalChartEntry: mocks.createDentalChartEntry,
  listDentalChartHistory: mocks.listDentalChartHistory,
}));

vi.mock('../services/treatment-plan.service.js', () => ({
  createTreatmentPlan: mocks.createTreatmentPlan,
  listTreatmentPlansForPatient: mocks.listTreatmentPlansForPatient,
}));

vi.mock('../lib/audit.js', () => ({
  recordClinicalAudit: mocks.recordClinicalAudit,
}));

import { buildClinicalServiceServer } from '../app.js';

const jwtSecret = 'dev-only-jwt-secret-change-me-immediately';
const jwtIssuer = 'dental-saas';
const tenantId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';

const issueToken = (): string =>
  jwt.sign({ userId: 'user-1', tenantId }, jwtSecret, {
    issuer: jwtIssuer,
  });

const auth = { authorization: `Bearer ${issueToken()}` };

describe('routes/patients', () => {
  const app = buildClinicalServiceServer();

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated list', async () => {
    const response = await app.inject({ method: 'GET', url: '/patients' });
    expect(response.statusCode).toBe(401);
  });

  it('lists patients for tenant from JWT', async () => {
    mocks.listPatients.mockResolvedValue({ patients: [], nextCursor: null });
    const response = await app.inject({
      method: 'GET',
      url: '/patients?limit=10',
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.listPatients).toHaveBeenCalledWith(tenantId, {
      limit: 10,
      cursor: undefined,
      q: undefined,
    });
  });

  it('returns 400 when list service reports invalid cursor', async () => {
    mocks.listPatients.mockRejectedValue(new Error('Invalid cursor'));
    const response = await app.inject({
      method: 'GET',
      url: '/patients?cursor=not-a-valid-cursor',
      headers: auth,
    });
    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: string };
    expect(body.error).toBe('Invalid cursor.');
  });

  it('returns 400 when search has no criteria', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/patients/search?limit=5',
      headers: auth,
    });
    expect(response.statusCode).toBe(400);
  });

  it('searches patients', async () => {
    mocks.searchPatients.mockResolvedValue({ patients: [], nextCursor: null });
    const response = await app.inject({
      method: 'GET',
      url: '/patients/search?lastName=Doe&limit=5',
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.searchPatients).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ lastName: 'Doe', limit: 5 })
    );
  });

  it('lists encounters for patient', async () => {
    mocks.listEncountersForPatient.mockResolvedValueOnce({
      encounters: [{ id: 'e1' }],
      nextCursor: null,
    });
    const response = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}/encounters?limit=10`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.listEncountersForPatient).toHaveBeenCalledWith(
      patientId,
      tenantId,
      expect.objectContaining({ limit: 10 })
    );

    mocks.listEncountersForPatient.mockResolvedValueOnce(null);
    const notFound = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}/encounters`,
      headers: auth,
    });
    expect(notFound.statusCode).toBe(404);
  });

  it('gets patient by id', async () => {
    mocks.getPatient.mockResolvedValueOnce({ id: patientId, firstName: 'A' });
    let response = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.getPatient).toHaveBeenCalledWith(patientId, tenantId);
    const body = response.json() as { patient: { firstName: string } };
    expect(body.patient.firstName).toBe('A');

    mocks.getPatient.mockResolvedValueOnce(null);
    response = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(404);
  });

  it('creates patient and records audit', async () => {
    mocks.createPatient.mockResolvedValue({
      id: patientId,
      firstName: 'Jane',
      lastName: 'Doe',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/patients',
      headers: { ...auth, 'x-request-id': 'req-xyz' },
      payload: {
        firstName: 'Jane',
        lastName: 'Doe',
        contactEmail: 'j@example.com',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(mocks.createPatient).toHaveBeenCalled();
    expect(mocks.recordClinicalAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PATIENT_CREATED',
        resourceType: 'patient',
        resourceId: patientId,
        requestId: 'req-xyz',
        tenantId,
        userId: 'user-1',
      })
    );
  });

  it('rejects unauthenticated post', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/patients',
      payload: { firstName: 'J', lastName: 'D' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects create with invalid body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/patients',
      headers: auth,
      payload: { firstName: 'J' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('gets patient history or 404', async () => {
    mocks.getPatientHistory.mockResolvedValueOnce({
      encounters: [{ id: 'e1' }],
      notes: [],
    });
    let response = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}/history`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { encounters: unknown[] };
    expect(body.encounters).toHaveLength(1);

    mocks.getPatientHistory.mockResolvedValueOnce(null);
    response = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}/history`,
      headers: auth,
    });
    expect(response.statusCode).toBe(404);
  });

  it('patches and deletes patient with audit and not-found', async () => {
    mocks.updatePatient.mockResolvedValueOnce({ id: patientId, firstName: 'Up' });
    let response = await app.inject({
      method: 'PATCH',
      url: `/patients/${patientId}`,
      headers: { ...auth, 'x-request-id': 'r1' },
      payload: { firstName: 'Up' },
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.recordClinicalAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PATIENT_UPDATED', resourceId: patientId })
    );

    mocks.updatePatient.mockResolvedValueOnce(null);
    response = await app.inject({
      method: 'PATCH',
      url: `/patients/${patientId}`,
      headers: auth,
      payload: { firstName: 'Up' },
    });
    expect(response.statusCode).toBe(404);

    mocks.softDeletePatient.mockResolvedValueOnce(true);
    response = await app.inject({
      method: 'DELETE',
      url: `/patients/${patientId}`,
      headers: { ...auth, 'x-request-id': 'r2' },
    });
    expect(response.statusCode).toBe(204);
    expect(mocks.recordClinicalAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PATIENT_DELETED', resourceId: patientId })
    );

    mocks.softDeletePatient.mockResolvedValueOnce(false);
    response = await app.inject({
      method: 'DELETE',
      url: `/patients/${patientId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(404);
  });

  it('gets dental chart, creates entry, and lists chart history', async () => {
    mocks.getDentalChartForPatient.mockResolvedValue({
      chart: { entries: [{ id: 'e1', toothNumber: '14' }], byTooth: { '14': [] } },
    });
    let response = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}/chart`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.getDentalChartForPatient).toHaveBeenCalledWith(patientId, tenantId);

    mocks.createDentalChartEntry.mockResolvedValue({ id: 'e-new', toothNumber: '3' });
    response = await app.inject({
      method: 'POST',
      url: `/patients/${patientId}/chart/entries`,
      headers: auth,
      payload: {
        toothNumber: '3',
        condition: 'CARIES',
        surface: 'O',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(mocks.createDentalChartEntry).toHaveBeenCalled();

    mocks.listDentalChartHistory.mockResolvedValue([
      { id: 'h1', chartEntryId: 'e-new', eventType: 'CREATED' },
    ]);
    response = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}/chart/history?limit=10`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      history: [{ id: 'h1', chartEntryId: 'e-new', eventType: 'CREATED' }],
    });
  });

  it('lists and creates treatment plans for patient', async () => {
    mocks.listTreatmentPlansForPatient.mockResolvedValue({ treatmentPlans: [{ id: 'tp1' }] });
    let response = await app.inject({
      method: 'GET',
      url: `/patients/${patientId}/treatment-plans`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.listTreatmentPlansForPatient).toHaveBeenCalledWith(patientId, tenantId);

    mocks.createTreatmentPlan.mockResolvedValue({ id: 'tp-new', status: 'DRAFT' });
    response = await app.inject({
      method: 'POST',
      url: `/patients/${patientId}/treatment-plans`,
      headers: auth,
      payload: { title: 'Phase 1' },
    });
    expect(response.statusCode).toBe(201);
    expect(mocks.createTreatmentPlan).toHaveBeenCalled();
  });
});
