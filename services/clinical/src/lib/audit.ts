import { auditEvents, createDatabaseConnection } from '@saas/config';

export interface ClinicalAuditEvent {
  tenantId: string;
  userId: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  requestId?: string;
  metadata?: Record<string, unknown> | null;
}

export async function recordClinicalAudit(event: ClinicalAuditEvent): Promise<void> {
  const db = createDatabaseConnection();
  await db.insert(auditEvents).values({
    tenantId: event.tenantId,
    actorType: 'USER',
    actorId: event.userId,
    eventType: event.eventType,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    requestId: event.requestId ?? null,
    metadata: event.metadata ?? null,
  });
}
