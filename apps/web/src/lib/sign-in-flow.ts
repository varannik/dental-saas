import type { ClinicRequiredProblem, LoginResponse, SessionResponse } from '@dental/contracts';
import messages from '../messages/en.json';
import { ApiError } from './api';

/**
 * The sign-in steps as a pure state machine, so every branch is testable without a browser:
 * credentials, then a clinic choice for members of several clinics, then a TOTP code, or
 * enrolment of an authenticator app on a first sign-in.
 */

const t = messages.auth;

export type SignInStep =
  | { step: 'credentials'; error?: string }
  | { step: 'clinic'; clinics: ClinicRequiredProblem['clinics']; error?: string }
  | { step: 'code'; challengeToken: string; error?: string }
  | {
      step: 'enroll';
      challengeToken: string;
      secret: string;
      otpauthUrl: string;
      error?: string;
    }
  | { step: 'done'; session: SessionResponse };

export const START: SignInStep = { step: 'credentials' };

/** The step after the password was accepted. */
export function afterLogin(result: LoginResponse): SignInStep {
  switch (result.status) {
    case 'signed_in':
      return { step: 'done', session: result };
    case 'mfa_required':
      return { step: 'code', challengeToken: result.challengeToken };
    case 'mfa_enrollment_required':
      return {
        step: 'enroll',
        challengeToken: result.challengeToken,
        secret: result.secret,
        otpauthUrl: result.otpauthUrl,
      };
  }
}

export function lockMessage(lockedUntil: unknown, now = Date.now()): string {
  const until = typeof lockedUntil === 'string' ? Date.parse(lockedUntil) : NaN;
  const minutes = Number.isNaN(until) ? 1 : Math.max(1, Math.ceil((until - now) / 60_000));
  return t.errors.locked.replace('{minutes}', String(minutes));
}

/** The step to show after a failed request, keeping the user where they can recover. */
export function afterError(error: unknown, current: SignInStep, now = Date.now()): SignInStep {
  if (!(error instanceof ApiError)) return { ...current, error: t.errors.generic } as SignInStep;
  switch (error.code) {
    case 'clinic_required':
      return { step: 'clinic', clinics: (error.body as unknown as ClinicRequiredProblem).clinics };
    case 'invalid_credentials':
      return { step: 'credentials', error: t.errors.invalidCredentials };
    case 'account_locked':
      return { step: 'credentials', error: lockMessage(error.body.lockedUntil, now) };
    case 'rate_limited':
      return { ...current, error: t.errors.rateLimited } as SignInStep;
    case 'invalid_mfa_code':
      return { ...current, error: t.errors.invalidCode } as SignInStep;
    case 'unauthenticated':
      // The challenge token expired between the password and the code.
      return { step: 'credentials', error: t.errors.challengeExpired };
    case 'forbidden':
      return { step: 'credentials', error: t.errors.noClinic };
    case 'validation_failed':
      return { ...current, error: t.errors.invalidInput } as SignInStep;
    case 'network_error':
      return { ...current, error: t.errors.network } as SignInStep;
    default:
      if (error.status === 429) return { ...current, error: t.errors.rateLimited } as SignInStep;
      return { ...current, error: t.errors.generic } as SignInStep;
  }
}
