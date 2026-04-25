export function hasPermission(permission: string, permissions: readonly string[]): boolean {
  return permissions.includes(permission);
}
