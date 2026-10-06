import { z } from 'zod';
import { PATIENT_SEX } from './patients.js';
import type { PermissionKey } from './permissions.js';

/**
 * The command registry: the single definition of every state change (spec sections E and O).
 * REST routes, the voice interpreter's tool list and the tests all build on these
 * definitions, which keeps voice and GUI on the same logic. Handlers live in the API.
 */

/**
 * How much confirmation a command needs (spec section H). R0 reads and navigates; R1 selects
 * a patient; R2 is a clinical or cost write; R3 is irreversible or administrative and always
 * needs a click on screen.
 */
export const RISK_TIERS = ['R0', 'R1', 'R2', 'R3'] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const COMMAND_SOURCES = ['gui', 'voice', 'system'] as const;
export type CommandSource = (typeof COMMAND_SOURCES)[number];

export interface CommandDefinition<Payload extends z.ZodType = z.ZodType> {
  type: string;
  description: string;
  permission: PermissionKey;
  risk: RiskTier;
  payload: Payload;
  /**
   * What the command log stores instead of the payload, for commands that carry an
   * identifier that is encrypted at rest, such as a national ID.
   */
  redact?: (payload: z.infer<Payload>) => unknown;
}

function defineCommand<Payload extends z.ZodType>(
  definition: CommandDefinition<Payload>
): CommandDefinition<Payload> {
  return definition;
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isCurrency(value: string): boolean {
  return Intl.supportedValuesOf('currency').includes(value);
}

/** Supported tooth notations. Only FDI has a parser and chart so far (spec section Q, 10). */
export const TOOTH_NOTATIONS = ['FDI'] as const;

export const clinicOnboard = defineCommand({
  type: 'clinic.onboard',
  description: 'Create a clinic with its settings and its first administrator.',
  permission: 'platform.manage',
  risk: 'R3',
  payload: z
    .object({
      name: z.string().trim().min(1).max(200),
      country: z.string().regex(/^[A-Z]{2}$/, 'Use an ISO 3166 country code such as GB.'),
      currency: z.string().refine(isCurrency, 'Use an ISO 4217 currency code such as GBP.'),
      timezone: z.string().refine(isTimeZone, 'Unknown time zone.'),
      defaultLocale: z
        .string()
        .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Use a language tag such as en or fa-IR.'),
      toothNotation: z.enum(TOOTH_NOTATIONS).default('FDI'),
      /** Key of a regulatory profile; the profile turns the clinic's rules into settings. */
      regulatoryProfile: z.string().min(1).max(100),
      admin: z
        .object({
          email: z.string().trim().toLowerCase().email().max(320),
          /** argon2id hash of a one-time password; the operator CLI prints the password once. */
          passwordHash: z.string().startsWith('$argon2id$'),
        })
        .strict(),
    })
    .strict(),
});

export type ClinicOnboard = z.infer<typeof clinicOnboard.payload>;

export const clinicUpdateSettings = defineCommand({
  type: 'clinic.update_settings',
  description: "Change the clinic's name, default language or time zone.",
  permission: 'admin.manage',
  risk: 'R3',
  payload: z
    .object({
      /** The version the change was made against; a stale version is a conflict. */
      version: z.number().int().positive(),
      name: z.string().trim().min(1).max(200).optional(),
      defaultLocale: z
        .string()
        .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Use a language tag such as en or fa-IR.')
        .optional(),
      timezone: z.string().refine(isTimeZone, 'Unknown time zone.').optional(),
    })
    .strict()
    .refine(
      (payload) => payload.name ?? payload.defaultLocale ?? payload.timezone,
      'Change at least one setting.'
    ),
});

export type ClinicUpdateSettings = z.infer<typeof clinicUpdateSettings.payload>;

function isPastDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value) &&
    value >= '1900-01-01' &&
    date.getTime() <= Date.now()
  );
}

const personName = z.string().trim().min(1).max(100);
const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine(isPastDate, 'Enter a real date of birth, not in the future.');
const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s().-]{6,24}$/, 'Enter a phone number.')
  .refine((value) => value.replace(/\D/g, '').length >= 6, 'Enter a phone number.');
const email = z.string().trim().toLowerCase().email().max(320);
const nationalId = z
  .string()
  .trim()
  .min(4)
  .max(32)
  .regex(/^[A-Za-z0-9\s-]+$/, 'Use letters, digits, spaces or hyphens.');

/** The national ID is encrypted at rest, so the command log keeps only whether one was sent. */
function redactNationalId<T extends { nationalId?: string | null }>(payload: T) {
  return payload.nationalId ? { ...payload, nationalId: '[redacted]' } : payload;
}

export const patientCreate = defineCommand({
  type: 'patient.create',
  description: 'Register a new patient.',
  permission: 'patient.write',
  risk: 'R2',
  payload: z
    .object({
      givenName: personName,
      familyName: personName,
      birthDate,
      sex: z.enum(PATIENT_SEX),
      phone: phone.optional(),
      email: email.optional(),
      nationalId: nationalId.optional(),
      /** Create even though possible duplicates were found and reviewed. */
      force: z.boolean().default(false),
    })
    .strict(),
  redact: redactNationalId,
});

export type PatientCreate = z.infer<typeof patientCreate.payload>;

export const patientUpdate = defineCommand({
  type: 'patient.update',
  description: "Change a patient's details, or archive or restore the patient.",
  permission: 'patient.write',
  risk: 'R2',
  payload: z
    .object({
      patientId: z.string().uuid(),
      version: z.number().int().positive(),
      givenName: personName.optional(),
      familyName: personName.optional(),
      birthDate: birthDate.optional(),
      sex: z.enum(PATIENT_SEX).optional(),
      /** null removes the value. */
      phone: phone.nullable().optional(),
      email: email.nullable().optional(),
      nationalId: nationalId.nullable().optional(),
      /** Patients are archived, never deleted. */
      status: z.enum(['active', 'archived']).optional(),
    })
    .strict()
    .refine(
      ({ patientId: _id, version: _version, ...changes }) =>
        Object.values(changes).some((value) => value !== undefined),
      'Change at least one detail.'
    ),
  redact: redactNationalId,
});

export type PatientUpdate = z.infer<typeof patientUpdate.payload>;

/** Keyed by type; a test checks every key matches its definition's type. */
export const COMMANDS = {
  'clinic.onboard': clinicOnboard,
  'clinic.update_settings': clinicUpdateSettings,
  'patient.create': patientCreate,
  'patient.update': patientUpdate,
} as const satisfies Record<string, CommandDefinition>;

export type CommandType = keyof typeof COMMANDS;

export function isCommandType(value: string): value is CommandType {
  return Object.hasOwn(COMMANDS, value);
}
