import { clinicUpdateSettings, type ClinicUpdateSettings } from '@dental/contracts';
import { HttpProblem } from '../../platform/http-problem.js';
import type { CommandBus, HandlerContext, HandlerOutcome } from '../commands/bus.js';

/** Clinic settings: name, default language and time zone (F10 adds onboarding). */

export interface ClinicSettings {
  id: string;
  name: string;
  defaultLocale: string;
  timezone: string;
  version: number;
}

interface ClinicRow {
  id: string;
  name: string;
  default_locale: string;
  timezone: string;
  version: number;
}

const FIELDS = [
  ['name', 'name'],
  ['defaultLocale', 'default_locale'],
  ['timezone', 'timezone'],
] as const;

function view(row: ClinicRow): ClinicSettings {
  return {
    id: row.id,
    name: row.name,
    defaultLocale: row.default_locale,
    timezone: row.timezone,
    version: row.version,
  };
}

export async function updateClinicSettings(
  { client, actor }: HandlerContext,
  payload: ClinicUpdateSettings
): Promise<HandlerOutcome<ClinicSettings>> {
  // Row-level security limits this to the actor's own clinic.
  const current = (
    await client.query<ClinicRow>(
      `SELECT id, name, default_locale, timezone, version FROM core.clinics
       WHERE id = $1 FOR UPDATE`,
      [actor.clinicId]
    )
  ).rows[0];
  if (!current) throw new HttpProblem(404, 'not_found', 'Clinic not found.');
  if (current.version !== payload.version) {
    throw new HttpProblem(409, 'version_conflict', 'The settings were changed by someone else.', {
      currentVersion: current.version,
    });
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const next = { ...current };
  for (const [key, column] of FIELDS) {
    const value = payload[key];
    if (value === undefined || value === current[column]) continue;
    before[key] = current[column];
    after[key] = value;
    next[column] = value;
  }
  if (Object.keys(after).length === 0) return { result: view(current), audit: [] };

  const updated = (
    await client.query<ClinicRow>(
      `UPDATE core.clinics
       SET name = $2, default_locale = $3, timezone = $4, version = version + 1, updated_at = now()
       WHERE id = $1
       RETURNING id, name, default_locale, timezone, version`,
      [current.id, next.name, next.default_locale, next.timezone]
    )
  ).rows[0]!;

  return {
    result: view(updated),
    audit: [
      {
        action: clinicUpdateSettings.type,
        entity: 'clinic',
        entityId: current.id,
        before: { ...before, version: current.version },
        after: { ...after, version: updated.version },
      },
    ],
  };
}

export function registerClinicCommands(bus: CommandBus) {
  bus.register(clinicUpdateSettings, updateClinicSettings);
}
