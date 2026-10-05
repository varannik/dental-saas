import type { ProblemDetails } from './errors.js';

/** Response shapes of the sign-in endpoints, shared by the API and the web client. */

export interface ClinicMembership {
  clinicId: string;
  clinicName: string;
  role: string;
}

/** POST /v1/auth/login, /mfa/verify and /refresh when a session is issued. */
export interface SessionResponse {
  status: 'signed_in';
  accessToken: string;
  tokenType: 'Bearer';
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: { id: string; email: string; locale: string };
  clinic: { id: string; name: string };
  role: string;
  permissions: string[];
  memberships: ClinicMembership[];
}

export interface MfaChallengeResponse {
  status: 'mfa_required';
  challengeToken: string;
  expiresIn: number;
}

export interface MfaEnrollmentResponse {
  status: 'mfa_enrollment_required';
  challengeToken: string;
  expiresIn: number;
  /** Base32 secret, shown once, for manual entry into an authenticator app. */
  secret: string;
  /** otpauth:// link for a QR code. */
  otpauthUrl: string;
}

export type LoginResponse = SessionResponse | MfaChallengeResponse | MfaEnrollmentResponse;

/** 422 clinic_required: the user belongs to several clinics and must choose one. */
export interface ClinicRequiredProblem extends ProblemDetails {
  code: 'clinic_required';
  clinics: { id: string; name: string; role: string }[];
}

/** GET /v1/me */
export interface MeResponse {
  user: { id: string; email: string; locale: string };
  clinic: {
    id: string;
    name: string;
    country: string;
    currency: string;
    timezone: string;
    toothNotation: string;
    defaultLocale: string;
  };
  role: string;
  permissions: string[];
}

/** Header the cookie endpoints require (CSRF protection). */
export const CSRF_HEADER = 'x-requested-with';
