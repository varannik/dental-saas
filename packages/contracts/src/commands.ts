import { z } from 'zod';
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

/** Keyed by type; a test checks every key matches its definition's type. */
export const COMMANDS = {
  'clinic.onboard': clinicOnboard,
  'clinic.update_settings': clinicUpdateSettings,
} as const satisfies Record<string, CommandDefinition>;

export type CommandType = keyof typeof COMMANDS;

export function isCommandType(value: string): value is CommandType {
  return Object.hasOwn(COMMANDS, value);
}
