export const PERMISSIONS = [
  'patient.read',
  'patient.write',
  'history.write',
  'session.read',
  'session.write',
  'session.sign',
  'session.amend',
  'diagnosis.write',
  // Suggest a diagnosis for a dentist to confirm (spec section I: assistants cannot confirm).
  'diagnosis.suggest',
  'plan.write',
  'procedure.write',
  'usage.write',
  'cost.read',
  'catalog.manage',
  'price.read',
  'price.manage',
  'voice.use',
  'evidence.ask',
  'audit.read',
  'admin.manage',
  'research.export',
  'lab.manage',
  'lab.review',
  // Platform operations such as onboarding a clinic. No clinic role holds it; only the
  // operator CLI's system actor does.
  'platform.manage',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}
