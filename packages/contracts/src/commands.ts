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
  'clinic.update_settings': clinicUpdateSettings,
} as const satisfies Record<string, CommandDefinition>;

export type CommandType = keyof typeof COMMANDS;

export function isCommandType(value: string): value is CommandType {
  return Object.hasOwn(COMMANDS, value);
}
