import jwt from 'jsonwebtoken';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTreatmentPlanWithItems: vi.fn(),
  addTreatmentPlanItem: vi.fn(),
  markTreatmentPlanPresented: vi.fn(),
  markTreatmentPlanAccepted: vi.fn(),
  updateTreatmentPlanItem: vi.fn(),
  removeTreatmentPlanItem: vi.fn(),
  recordClinicalAudit: vi.fn(),
}));

vi.mock('../services/treatment-plan.service.js', () => ({
  getTreatmentPlanWithItems: mocks.getTreatmentPlanWithItems,
  addTreatmentPlanItem: mocks.addTreatmentPlanItem,
  markTreatmentPlanPresented: mocks.markTreatmentPlanPresented,
  markTreatmentPlanAccepted: mocks.markTreatmentPlanAccepted,
  updateTreatmentPlanItem: mocks.updateTreatmentPlanItem,
  removeTreatmentPlanItem: mocks.removeTreatmentPlanItem,
}));

vi.mock('../lib/audit.js', () => ({
  recordClinicalAudit: mocks.recordClinicalAudit,
}));

import { buildClinicalServiceServer } from '../app.js';

const jwtSecret = 'dev-only-jwt-secret-change-me-immediately';
const jwtIssuer = 'dental-saas';
const tenantId = '11111111-1111-4111-8111-111111111111';
const planId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const itemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const issueToken = (): string =>
  jwt.sign({ userId: 'user-1', tenantId }, jwtSecret, {
    issuer: jwtIssuer,
  });

const auth = { authorization: `Bearer ${issueToken()}` };

describe('routes/treatment-plans', () => {
  const app = buildClinicalServiceServer();

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('gets plan with items', async () => {
    mocks.getTreatmentPlanWithItems.mockResolvedValue({
      plan: { id: planId },
      items: [],
    });
    const response = await app.inject({
      method: 'GET',
      url: `/treatment-plans/${planId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.getTreatmentPlanWithItems).toHaveBeenCalledWith(planId, tenantId);
  });

  it('adds item', async () => {
    mocks.addTreatmentPlanItem.mockResolvedValue({ id: itemId, cdtCode: 'D0120' });
    const response = await app.inject({
      method: 'POST',
      url: `/treatment-plans/${planId}/items`,
      headers: auth,
      payload: { cdtCode: 'D0120' },
    });
    expect(response.statusCode).toBe(201);
  });

  it('presents and accepts plan', async () => {
    mocks.markTreatmentPlanPresented.mockResolvedValue({ id: planId, status: 'PRESENTED' });
    let response = await app.inject({
      method: 'POST',
      url: `/treatment-plans/${planId}/present`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);

    mocks.markTreatmentPlanAccepted.mockResolvedValue({ id: planId, status: 'ACCEPTED' });
    response = await app.inject({
      method: 'POST',
      url: `/treatment-plans/${planId}/accept`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
  });

  it('patches and deletes item', async () => {
    mocks.updateTreatmentPlanItem.mockResolvedValue({ id: itemId });
    let response = await app.inject({
      method: 'PATCH',
      url: `/treatment-plans/${planId}/items/${itemId}`,
      headers: auth,
      payload: { notes: 'x' },
    });
    expect(response.statusCode).toBe(200);

    mocks.removeTreatmentPlanItem.mockResolvedValue(undefined);
    response = await app.inject({
      method: 'DELETE',
      url: `/treatment-plans/${planId}/items/${itemId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(204);
  });
});
