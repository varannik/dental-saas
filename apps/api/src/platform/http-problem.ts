import type { ErrorCode } from '@dental/contracts';

/**
 * An error that maps to an RFC 9457 problem response with a stable code.
 * Extra members (for example the clinics a user can choose from) are added to the body.
 */
export class HttpProblem extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    readonly title: string,
    readonly extra: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {}
  ) {
    super(title);
    this.name = 'HttpProblem';
  }
}
