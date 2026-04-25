export interface TenantContext {
  tenantId: string;
}

export function getTenantContext(tenantId: string): TenantContext {
  return { tenantId };
}
