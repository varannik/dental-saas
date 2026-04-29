import jwt from 'jsonwebtoken';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClinicalNote: vi.fn(),
  updateClinicalNote: vi.fn(),
  signClinicalNote: vi.fn(),
  recordClinicalAudit: vi.fn(),
}));

vi.mock('../services/note.service.js', () => ({
  getClinicalNote: mocks.getClinicalNote,
  updateClinicalNote: mocks.updateClinicalNote,
  signClinicalNote: mocks.signClinicalNote,
  NoteNotFoundError: class extends Error {
    statusCode = 404;
    constructor() {
      super('Clinical note not found.');
      this.name = 'NoteNotFoundError';
    }
  },
  NoteForbiddenError: class extends Error {
    statusCode = 403;
    constructor(m?: string) {
      super(m ?? 'forbidden');
      this.name = 'NoteForbiddenError';
    }
  },
  NoteConflictError: class extends Error {
    statusCode = 409;
    constructor(m?: string) {
      super(m ?? 'conflict');
      this.name = 'NoteConflictError';
    }
  },
}));

vi.mock('../lib/audit.js', () => ({
  recordClinicalAudit: mocks.recordClinicalAudit,
}));

import { buildClinicalServiceServer } from '../app.js';
import { NoteConflictError } from '../services/note.service.js';

const jwtSecret = 'dev-only-jwt-secret-change-me-immediately';
const jwtIssuer = 'dental-saas';
const tenantId = '11111111-1111-4111-8111-111111111111';
const noteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const issueToken = (): string =>
  jwt.sign({ userId: 'user-1', tenantId }, jwtSecret, {
    issuer: jwtIssuer,
  });

const auth = { authorization: `Bearer ${issueToken()}` };

describe('routes/notes', () => {
  const app = buildClinicalServiceServer();

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('gets note by id', async () => {
    mocks.getClinicalNote.mockResolvedValueOnce({ id: noteId });
    let response = await app.inject({
      method: 'GET',
      url: `/notes/${noteId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);

    mocks.getClinicalNote.mockResolvedValueOnce(null);
    response = await app.inject({
      method: 'GET',
      url: `/notes/${noteId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(404);
  });

  it('patches note', async () => {
    mocks.updateClinicalNote.mockResolvedValue({ id: noteId, content: 'x' });
    const response = await app.inject({
      method: 'PATCH',
      url: `/notes/${noteId}`,
      headers: auth,
      payload: { content: 'updated' },
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.updateClinicalNote).toHaveBeenCalled();
  });

  it('returns 409 when service reports signed note', async () => {
    mocks.updateClinicalNote.mockRejectedValue(new NoteConflictError());
    const response = await app.inject({
      method: 'PATCH',
      url: `/notes/${noteId}`,
      headers: auth,
      payload: { content: 'x' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('signs note', async () => {
    mocks.signClinicalNote.mockResolvedValue({
      id: noteId,
      signedAt: new Date().toISOString(),
    });
    const response = await app.inject({
      method: 'POST',
      url: `/notes/${noteId}/sign`,
      headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.signClinicalNote).toHaveBeenCalledWith(noteId, tenantId, 'user-1');
  });
});
