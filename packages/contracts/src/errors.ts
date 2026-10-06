export const ERROR_CODES = [
  'validation_failed',
  'unauthenticated',
  'invalid_credentials',
  'invalid_mfa_code',
  'account_locked',
  'clinic_required',
  'refresh_token_reused',
  'refresh_superseded',
  'forbidden',
  'not_found',
  'version_conflict',
  'idempotency_key_reused',
  'session_signed',
  'session_open',
  'session_closed',
  'domain_rule_violated',
  'rate_limited',
  'possible_duplicate',
  'no_price_at_time',
  'proposal_expired',
  'context_changed',
  'not_undoable',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance?: string;
  requestId?: string;
}
