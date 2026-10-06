import { z } from 'zod';
import {
  FINDING_CODES,
  FINDINGS,
  isValidFdi,
  NOTE_TYPES,
  PERIO_SITES,
  SURFACES,
  surfacesOf,
  type FindingCode,
} from './chart.js';
import { ALLERGY_SEVERITIES, HISTORY_END_REASONS, HISTORY_KINDS } from './history.js';
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

export const historyAdd = defineCommand({
  type: 'history.add',
  description: 'Record a condition, medication, allergy or risk factor for a patient.',
  permission: 'history.write',
  risk: 'R2',
  payload: z
    .object({
      patientId: z.string().uuid(),
      kind: z.enum(HISTORY_KINDS),
      label: z.string().trim().min(1).max(200),
      code: z.string().trim().min(1).max(50).optional(),
      detail: z.string().trim().min(1).max(500).optional(),
      severity: z.enum(ALLERGY_SEVERITIES).optional(),
      onsetDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
        .refine(isPastDate, 'Enter a real date, not in the future.')
        .optional(),
    })
    .strict()
    .refine((payload) => payload.kind === 'allergy' || payload.severity === undefined, {
      message: 'Only allergies have a severity.',
      path: ['severity'],
    }),
});

export type HistoryAdd = z.infer<typeof historyAdd.payload>;

export const historyEnd = defineCommand({
  type: 'history.end',
  description: 'End a history entry as resolved, stopped or entered in error. Nothing is deleted.',
  permission: 'history.write',
  risk: 'R2',
  payload: z
    .object({
      patientId: z.string().uuid(),
      entryId: z.string().uuid(),
      reason: z.enum(HISTORY_END_REASONS),
      note: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
});

export type HistoryEnd = z.infer<typeof historyEnd.payload>;

const tooth = z.string().refine(isValidFdi, 'Use an FDI tooth number such as 16.');

export const sessionStart = defineCommand({
  type: 'session.start',
  description: "Open today's clinical session for a patient.",
  permission: 'session.write',
  risk: 'R2',
  payload: z
    .object({
      patientId: z.string().uuid(),
      chiefComplaint: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
});

export type SessionStart = z.infer<typeof sessionStart.payload>;

export const sessionComplete = defineCommand({
  type: 'session.complete',
  description: 'Mark a session as completed. Signing follows in C6.',
  permission: 'session.write',
  risk: 'R2',
  payload: z.object({ sessionId: z.string().uuid() }).strict(),
});

export type SessionComplete = z.infer<typeof sessionComplete.payload>;

export const findingAdd = defineCommand({
  type: 'finding.add',
  description: 'Record an examination finding on a tooth or some of its surfaces.',
  permission: 'session.write',
  risk: 'R2',
  payload: z
    .object({
      sessionId: z.string().uuid(),
      tooth,
      /** Leave out for a whole-tooth finding. */
      surfaces: z.array(z.enum(SURFACES)).min(1).max(5).optional(),
      code: z.enum(FINDING_CODES as [FindingCode, ...FindingCode[]]),
      /** For example a mobility grade or a restoration material. */
      value: z.string().trim().min(1).max(50).optional(),
      note: z.string().trim().min(1).max(500).optional(),
      /** An earlier finding on the same place that this one corrects. */
      supersedesId: z.string().uuid().optional(),
    })
    .strict()
    .superRefine((payload, context) => {
      const scope = FINDINGS[payload.code].scope;
      if (scope === 'surface' && !payload.surfaces) {
        context.addIssue({
          code: 'custom',
          path: ['surfaces'],
          message: 'Choose the surfaces.',
        });
      }
      if (scope === 'tooth' && payload.surfaces) {
        context.addIssue({
          code: 'custom',
          path: ['surfaces'],
          message: 'This finding applies to the whole tooth.',
        });
      }
      if (payload.surfaces && isValidFdi(payload.tooth)) {
        const allowed = surfacesOf(payload.tooth);
        const wrong = payload.surfaces.filter((surface) => !allowed.includes(surface));
        if (wrong.length > 0) {
          context.addIssue({
            code: 'custom',
            path: ['surfaces'],
            message: `Tooth ${payload.tooth} has no ${wrong.join(', ')} surface.`,
          });
        }
        if (new Set(payload.surfaces).size !== payload.surfaces.length) {
          context.addIssue({ code: 'custom', path: ['surfaces'], message: 'Repeated surface.' });
        }
      }
    }),
});

export type FindingAdd = z.infer<typeof findingAdd.payload>;

export const perioRecord = defineCommand({
  type: 'perio.record',
  description: 'Record periodontal probing for some or all sites.',
  permission: 'session.write',
  risk: 'R2',
  payload: z
    .object({
      sessionId: z.string().uuid(),
      measurements: z
        .array(
          z
            .object({
              tooth,
              site: z.enum(PERIO_SITES),
              pocketDepth: z.number().int().min(0).max(20),
              bleeding: z.boolean().default(false),
              recession: z.number().int().min(-5).max(15).optional(),
            })
            .strict()
        )
        .min(1)
        .max(32 * 6),
    })
    .strict(),
});

export type PerioRecord = z.infer<typeof perioRecord.payload>;

export const noteAdd = defineCommand({
  type: 'note.add',
  description: 'Add a note to a session.',
  permission: 'session.write',
  risk: 'R2',
  payload: z
    .object({
      sessionId: z.string().uuid(),
      type: z.enum(NOTE_TYPES).default('clinical'),
      body: z.string().trim().min(1).max(10_000),
    })
    .strict(),
});

export type NoteAdd = z.infer<typeof noteAdd.payload>;

/** Keyed by type; a test checks every key matches its definition's type. */
export const COMMANDS = {
  'clinic.onboard': clinicOnboard,
  'clinic.update_settings': clinicUpdateSettings,
  'patient.create': patientCreate,
  'patient.update': patientUpdate,
  'history.add': historyAdd,
  'history.end': historyEnd,
  'session.start': sessionStart,
  'session.complete': sessionComplete,
  'finding.add': findingAdd,
  'perio.record': perioRecord,
  'note.add': noteAdd,
} as const satisfies Record<string, CommandDefinition>;

export type CommandType = keyof typeof COMMANDS;

export function isCommandType(value: string): value is CommandType {
  return Object.hasOwn(COMMANDS, value);
}
