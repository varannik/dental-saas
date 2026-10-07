import {
  CSRF_HEADER,
  type ChartEntry,
  type ClinicalNote,
  type ClinicalSession,
  type Diagnosis,
  type Finding,
  type HistoryEntry,
  type HistoryKind,
  type LoginResponse,
  type MeResponse,
  type Patient,
  type Procedure,
  type SessionAmendment,
  type PatientHistory,
  type PatientChart,
  type PatientSearchResponse,
  type ProcedureType,
  type TreatmentPlan,
  type SessionDetail,
  type SessionResponse,
} from '@dental/contracts';

/**
 * A small typed client for the API. Clinical data goes from the browser to the API origin
 * directly, never through Vercel functions (spec section A). Requests include credentials so
 * the httpOnly refresh cookie travels with the auth calls.
 *
 * The spec's client generated from OpenAPI replaces this once the API publishes its contract.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** A problem response from the API (RFC 9457), or a network failure with status 0. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown>
  ) {
    super(typeof body.title === 'string' ? body.title : code);
    this.name = 'ApiError';
  }
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  token?: string;
  /** The cookie endpoints require the CSRF header. */
  csrf?: boolean;
  /** Every write sends one, so a retried request cannot apply twice. */
  idempotencyKey?: string;
}

export type Fetcher = typeof fetch;

export function createApi(fetcher: Fetcher = (...args) => fetch(...args), baseUrl = API_URL) {
  async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.csrf) headers[CSRF_HEADER] = 'fetch';
    if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'include',
      });
    } catch {
      throw new ApiError(0, 'network_error', {});
    }
    if (response.status === 204) return undefined as T;
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = typeof data?.code === 'string' ? data.code : 'internal_error';
      throw new ApiError(response.status, code, data ?? {});
    }
    return data as T;
  }

  return {
    login: (body: { email: string; password: string; clinicId?: string }) =>
      call<LoginResponse>('/v1/auth/login', { method: 'POST', body }),
    verifyMfa: (body: { challengeToken: string; code: string }) =>
      call<SessionResponse>('/v1/auth/mfa/verify', { method: 'POST', body }),
    refresh: () => call<SessionResponse>('/v1/auth/refresh', { method: 'POST', csrf: true }),
    logout: () => call<void>('/v1/auth/logout', { method: 'POST', csrf: true }),
    me: (token: string) => call<MeResponse>('/v1/me', { token }),

    searchPatients: (token: string, query: string, options: { includeArchived?: boolean } = {}) =>
      call<PatientSearchResponse>(
        `/v1/patients?${new URLSearchParams({
          q: query,
          ...(options.includeArchived ? { includeArchived: 'true' } : {}),
        })}`,
        { token }
      ),
    getPatient: (token: string, id: string) =>
      call<Patient>(`/v1/patients/${encodeURIComponent(id)}`, { token }),
    createPatient: (token: string, body: Record<string, unknown>, idempotencyKey: string) =>
      call<Patient>('/v1/patients', { method: 'POST', body, token, idempotencyKey }),
    updatePatient: (
      token: string,
      id: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<Patient>(`/v1/patients/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body,
        token,
        idempotencyKey,
      }),

    getHistory: (token: string, patientId: string, includeEnded = false) =>
      call<PatientHistory>(
        `/v1/patients/${encodeURIComponent(patientId)}/history${includeEnded ? '?includeEnded=true' : ''}`,
        { token }
      ),
    addHistory: (
      token: string,
      patientId: string,
      kind: HistoryKind,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<HistoryEntry>(`/v1/patients/${encodeURIComponent(patientId)}/history/${kind}`, {
        method: 'POST',
        body,
        token,
        idempotencyKey,
      }),
    endHistory: (
      token: string,
      patientId: string,
      entryId: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<HistoryEntry>(
        `/v1/patients/${encodeURIComponent(patientId)}/history/${encodeURIComponent(entryId)}/end`,
        { method: 'POST', body, token, idempotencyKey }
      ),

    listSessions: (token: string, patientId: string) =>
      call<{ sessions: ClinicalSession[] }>(
        `/v1/patients/${encodeURIComponent(patientId)}/sessions`,
        { token }
      ),
    getSession: (token: string, sessionId: string) =>
      call<SessionDetail>(`/v1/sessions/${encodeURIComponent(sessionId)}`, { token }),
    getChart: (token: string, patientId: string) =>
      call<PatientChart>(`/v1/patients/${encodeURIComponent(patientId)}/chart`, { token }),
    startSession: (token: string, body: Record<string, unknown>, idempotencyKey: string) =>
      call<ClinicalSession>('/v1/sessions', { method: 'POST', body, token, idempotencyKey }),
    completeSession: (token: string, sessionId: string, idempotencyKey: string) =>
      call<ClinicalSession>(`/v1/sessions/${encodeURIComponent(sessionId)}/complete`, {
        method: 'POST',
        body: {},
        token,
        idempotencyKey,
      }),
    addFinding: (
      token: string,
      sessionId: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<{ findings: Finding[]; chart: ChartEntry[] }>(
        `/v1/sessions/${encodeURIComponent(sessionId)}/findings`,
        { method: 'POST', body, token, idempotencyKey }
      ),
    recordPerio: (
      token: string,
      sessionId: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<{ recorded: number }>(`/v1/sessions/${encodeURIComponent(sessionId)}/perio`, {
        method: 'POST',
        body,
        token,
        idempotencyKey,
      }),
    addNote: (
      token: string,
      sessionId: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<ClinicalNote>(`/v1/sessions/${encodeURIComponent(sessionId)}/notes`, {
        method: 'POST',
        body,
        token,
        idempotencyKey,
      }),
    addDiagnosis: (
      token: string,
      sessionId: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<Diagnosis>(`/v1/sessions/${encodeURIComponent(sessionId)}/diagnoses`, {
        method: 'POST',
        body,
        token,
        idempotencyKey,
      }),
    procedureTypes: (token: string) =>
      call<{ procedureTypes: ProcedureType[] }>('/v1/procedure-types', { token }),
    listPlans: (token: string, patientId: string) =>
      call<{ plans: TreatmentPlan[] }>(`/v1/patients/${encodeURIComponent(patientId)}/plans`, {
        token,
      }),
    createPlan: (
      token: string,
      patientId: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<TreatmentPlan>(`/v1/patients/${encodeURIComponent(patientId)}/plans`, {
        method: 'POST',
        body,
        token,
        idempotencyKey,
      }),
    /** plan actions: items, items/:itemId/cancel, reorder, accept, cancel */
    planAction: (
      token: string,
      planId: string,
      action: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<TreatmentPlan>(`/v1/plans/${encodeURIComponent(planId)}/${action}`, {
        method: 'POST',
        body,
        token,
        idempotencyKey,
      }),
    decideDiagnosis: (
      token: string,
      diagnosisId: string,
      body: { status: 'confirmed' | 'rejected' | 'retracted'; reason?: string },
      idempotencyKey: string
    ) =>
      call<Diagnosis>(`/v1/diagnoses/${encodeURIComponent(diagnosisId)}`, {
        method: 'PATCH',
        body,
        token,
        idempotencyKey,
      }),
    startProcedure: (
      token: string,
      sessionId: string,
      body: Record<string, unknown>,
      idempotencyKey: string
    ) =>
      call<Procedure>(`/v1/sessions/${encodeURIComponent(sessionId)}/procedures`, {
        method: 'POST',
        body,
        token,
        idempotencyKey,
      }),
    finishProcedure: (
      token: string,
      procedureId: string,
      body: { status: 'completed' | 'cancelled'; reason?: string },
      idempotencyKey: string
    ) =>
      call<Procedure>(`/v1/procedures/${encodeURIComponent(procedureId)}`, {
        method: 'PATCH',
        body,
        token,
        idempotencyKey,
      }),
    signSession: (token: string, sessionId: string, idempotencyKey: string) =>
      call<ClinicalSession>(`/v1/sessions/${encodeURIComponent(sessionId)}/sign`, {
        method: 'POST',
        body: {},
        token,
        idempotencyKey,
      }),
    amendSession: (
      token: string,
      sessionId: string,
      body: { reason: string; actions: { type: string; payload: Record<string, unknown> }[] },
      idempotencyKey: string
    ) =>
      call<{ amendment: SessionAmendment }>(
        `/v1/sessions/${encodeURIComponent(sessionId)}/amendments`,
        { method: 'POST', body, token, idempotencyKey }
      ),
  };
}

export type Api = ReturnType<typeof createApi>;

export const api = createApi();
