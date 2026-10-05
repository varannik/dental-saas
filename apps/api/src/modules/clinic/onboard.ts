import { clinicOnboard, type ClinicOnboard } from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import { HttpProblem } from '../../platform/http-problem.js';
import type { CommandBus, HandlerContext, HandlerOutcome } from '../commands/bus.js';

/**
 * Onboards a clinic (F10): the clinic with its settings, its first administrator and the
 * membership, recorded as the first entries of the clinic's audit chain.
 *
 * Runs only from the operator CLI, as the system actor on the database owner connection: it
 * creates a user and checks names across clinics, which the application role cannot. The new
 * clinic's id is the actor's clinic, so the transaction is already scoped to it.
 */

export interface OnboardResult {
  clinicId: string;
  adminUserId: string;
  /** False when the email already had an account, which keeps its password. */
  adminCreated: boolean;
}

export async function onboardClinic(
  { client, actor }: HandlerContext,
  payload: ClinicOnboard
): Promise<HandlerOutcome<OnboardResult>> {
  const duplicate = await client.query(
    'SELECT 1 FROM core.clinics WHERE lower(name) = lower($1) AND country = $2',
    [payload.name, payload.country]
  );
  if (duplicate.rowCount) {
    throw new HttpProblem(
      409,
      'possible_duplicate',
      'A clinic with this name already exists in this country.'
    );
  }
  const profile = (
    await client.query<{ id: string }>('SELECT id FROM core.regulatory_profiles WHERE key = $1', [
      payload.regulatoryProfile,
    ])
  ).rows[0];
  if (!profile) {
    throw new HttpProblem(
      422,
      'domain_rule_violated',
      `Unknown regulatory profile "${payload.regulatoryProfile}".`
    );
  }

  const clinicId = actor.clinicId;
  await client.query(
    `INSERT INTO core.clinics
       (id, name, country, regulatory_profile_id, default_locale, currency, timezone, tooth_notation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      clinicId,
      payload.name,
      payload.country,
      profile.id,
      payload.defaultLocale,
      payload.currency,
      payload.timezone,
      payload.toothNotation,
    ]
  );

  const existing = (
    await client.query<{ id: string }>('SELECT id FROM core.users WHERE email = $1', [
      payload.admin.email,
    ])
  ).rows[0];
  const adminUserId = existing?.id ?? uuidv7();
  if (!existing) {
    await client.query(`INSERT INTO core.users (id, email, password_hash) VALUES ($1, $2, $3)`, [
      adminUserId,
      payload.admin.email,
      payload.admin.passwordHash,
    ]);
  }
  const membershipId = uuidv7();
  await client.query(
    `INSERT INTO core.memberships (id, user_id, clinic_id, role_id)
     SELECT $1, $2, $3, id FROM core.roles WHERE key = 'admin' AND clinic_id IS NULL`,
    [membershipId, adminUserId, clinicId]
  );

  return {
    result: { clinicId, adminUserId, adminCreated: !existing },
    audit: [
      {
        action: clinicOnboard.type,
        entity: 'clinic',
        entityId: clinicId,
        before: null,
        after: {
          name: payload.name,
          country: payload.country,
          currency: payload.currency,
          timezone: payload.timezone,
          defaultLocale: payload.defaultLocale,
          toothNotation: payload.toothNotation,
          regulatoryProfile: payload.regulatoryProfile,
        },
      },
      {
        action: 'membership.create',
        entity: 'membership',
        entityId: membershipId,
        before: null,
        after: { userId: adminUserId, role: 'admin', newUser: !existing },
      },
    ],
  };
}

export function registerOnboarding(bus: CommandBus) {
  bus.register(clinicOnboard, onboardClinic);
}
