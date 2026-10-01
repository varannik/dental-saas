import type { ErrorCode, ProblemDetails } from '@dental/contracts';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'version_conflict',
  422: 'domain_rule_violated',
  429: 'rate_limited',
  500: 'internal_error',
};

export function problem(input: {
  status: number;
  title: string;
  code?: ErrorCode;
  detail?: string;
  instance?: string;
  requestId?: string;
}): ProblemDetails {
  return {
    type: 'about:blank',
    title: input.title,
    status: input.status,
    code: input.code ?? STATUS_CODES[input.status] ?? 'domain_rule_violated',
    detail: input.detail,
    instance: input.instance,
    requestId: input.requestId,
  };
}
