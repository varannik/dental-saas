import type { PermissionKey } from './permissions.js';

/**
 * System roles and their permissions (spec section I). The database seed in
 * packages/db/migrations/0002_identity.sql must match this map; a test enforces it.
 */
export const SYSTEM_ROLES = [
  'dentist',
  'assistant',
  'receptionist',
  'manager',
  'admin',
  'researcher',
  'reviewer',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ROLE_PERMISSIONS: Record<SystemRole, readonly PermissionKey[]> = {
  // All clinical steps; confirms diagnoses and signs sessions.
  dentist: [
    'patient.read',
    'patient.write',
    'history.write',
    'session.read',
    'session.write',
    'session.sign',
    'session.amend',
    'diagnosis.write',
    'diagnosis.suggest',
    'plan.write',
    'procedure.write',
    'usage.write',
    'cost.read',
    'price.read',
    'voice.use',
    'evidence.ask',
  ],
  // Records findings and material usage in an open session; cannot confirm diagnoses or sign.
  assistant: [
    'patient.read',
    'session.read',
    'session.write',
    'diagnosis.suggest',
    'usage.write',
    'voice.use',
  ],
  // Patient search and demographics; no clinical content and no costs.
  receptionist: ['patient.read', 'patient.write'],
  // Price and material management, cost reports, audit history.
  manager: ['catalog.manage', 'price.read', 'price.manage', 'cost.read', 'audit.read'],
  // Users, roles and settings.
  admin: ['admin.manage', 'audit.read'],
  // Research Lab and de-identified exports only.
  researcher: ['research.export', 'lab.manage'],
  // Blinded review queue only.
  reviewer: ['lab.review'],
};

/** Roles that must sign in with a second factor (spec section L). */
export const MFA_REQUIRED_ROLES: readonly SystemRole[] = ['dentist', 'manager', 'admin'];

export function isSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value);
}
