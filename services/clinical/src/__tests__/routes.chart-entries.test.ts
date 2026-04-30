import jwt from 'jsonwebtoken';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateDentalChartEntry: vi.fn(),
  softDeleteDentalChartEntry: vi.fn(),
  recordClinicalAudit: vi.fn(),
}));

vi.mock('../services/dental-chart.service.js', () => ({
  updateDentalChartEntry: mocks.updateDentalChartEntry,
  softDeleteDentalChartEntry: mocks.softDeleteDentalChartEntry,
}));

vi.mock('../lib/audit.js', () => ({
  recordClinicalAudit: mocks.recordClinicalAudit,
}));

import { buildClinicalServiceServer } from '../app.js';

const jwtSecret = 'dev-only-jwt-secret-change-me-immediately';
const jwtIssuer = 'dental-saas';
const tenantId = '11111111-1111-4111-8111-111111111111';
const entryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const issueToken = (): string =>
  jwt.sign({ userId: 'user-1', tenantId }, jwtSecret, {
    issuer: jwtIssuer,
  });

const auth = { authorization: `Bearer ${issueToken()}` };

describe('routes/chart-entries', () => {
  const app = buildClinicalServiceServer();

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('patches chart entry', async () => {
    mocks.updateDentalChartEntry.mockResolvedValue({ id: entryId, condition: 'FILLING' });
    const response = await app.inject({
      method: 'PATCH',
      url: `/chart-entries/${entryId}`,
      headers: auth,
      payload: { condition: 'FILLING' },
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.updateDentalChartEntry).toHaveBeenCalled();
  });

  it('deletes chart entry', async () => {
    mocks.softDeleteDentalChartEntry.mockResolvedValue(undefined);
    const response = await app.inject({
      method: 'DELETE',
      url: `/chart-entries/${entryId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(204);
    expect(mocks.softDeleteDentalChartEntry).toHaveBeenCalledWith(entryId, tenantId, 'user-1');
  });
});
