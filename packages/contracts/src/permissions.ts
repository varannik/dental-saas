export const PERMISSIONS = [
  'patient.read',
  'patient.write',
  'history.write',
  'session.read',
  'session.write',
  'session.sign',
  'session.amend',
  'diagnosis.write',
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
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}
