import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { recordClinicalAudit } from '../lib/audit.js';
import {
  createTreatmentPlanItemBodySchema,
  treatmentPlanIdParamSchema,
  treatmentPlanItemParamsSchema,
  updateTreatmentPlanItemBodySchema,
} from '../schemas/treatment-plan.schema.js';
import {
  addTreatmentPlanItem,
  getTreatmentPlanWithItems,
  markTreatmentPlanAccepted,
  markTreatmentPlanPresented,
  removeTreatmentPlanItem,
  TreatmentPlanItemNotFoundError,
  TreatmentPlanNotFoundError,
  TreatmentPlanStateError,
  updateTreatmentPlanItem,
} from '../services/treatment-plan.service.js';

function requestIdFrom(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-request-id'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (Array.isArray(raw) && raw[0]) return String(raw[0]);
  return undefined;
}

export const treatmentPlansDetailRoute: FastifyPluginAsync = async (app) => {
  app.post(
    '/:planId/present',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = treatmentPlanIdParamSchema.parse(request.params);
      try {
        const plan = await markTreatmentPlanPresented(params.planId, tenantId, userId);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'TREATMENT_PLAN_PRESENTED',
            resourceType: 'treatment_plan',
            resourceId: params.planId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ plan });
      } catch (e) {
        if (e instanceof TreatmentPlanNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof TreatmentPlanStateError) {
          return reply.code(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.post(
    '/:planId/accept',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = treatmentPlanIdParamSchema.parse(request.params);
      try {
        const plan = await markTreatmentPlanAccepted(params.planId, tenantId);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'TREATMENT_PLAN_ACCEPTED',
            resourceType: 'treatment_plan',
            resourceId: params.planId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ plan });
      } catch (e) {
        if (e instanceof TreatmentPlanNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof TreatmentPlanStateError) {
          return reply.code(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.post(
    '/:planId/items',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = treatmentPlanIdParamSchema.parse(request.params);
      const payload = createTreatmentPlanItemBodySchema.parse(request.body);
      try {
        const item = await addTreatmentPlanItem(params.planId, tenantId, payload);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'TREATMENT_PLAN_ITEM_CREATED',
            resourceType: 'treatment_plan_item',
            resourceId: String(item.id),
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.code(201).send({ item });
      } catch (e) {
        if (e instanceof TreatmentPlanNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof TreatmentPlanStateError) {
          return reply.code(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.patch(
    '/:planId/items/:itemId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = treatmentPlanItemParamsSchema.parse(request.params);
      const payload = updateTreatmentPlanItemBodySchema.parse(request.body);
      try {
        const item = await updateTreatmentPlanItem(params.planId, params.itemId, tenantId, payload);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'TREATMENT_PLAN_ITEM_UPDATED',
            resourceType: 'treatment_plan_item',
            resourceId: params.itemId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ item });
      } catch (e) {
        if (
          e instanceof TreatmentPlanNotFoundError ||
          e instanceof TreatmentPlanItemNotFoundError
        ) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof TreatmentPlanStateError) {
          return reply.code(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.delete(
    '/:planId/items/:itemId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = treatmentPlanItemParamsSchema.parse(request.params);
      try {
        await removeTreatmentPlanItem(params.planId, params.itemId, tenantId);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'TREATMENT_PLAN_ITEM_DELETED',
            resourceType: 'treatment_plan_item',
            resourceId: params.itemId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.code(204).send();
      } catch (e) {
        if (
          e instanceof TreatmentPlanNotFoundError ||
          e instanceof TreatmentPlanItemNotFoundError
        ) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof TreatmentPlanStateError) {
          return reply.code(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.get(
    '/:planId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = treatmentPlanIdParamSchema.parse(request.params);
      try {
        const data = await getTreatmentPlanWithItems(params.planId, tenantId);
        return reply.send(data);
      } catch (e) {
        if (e instanceof TreatmentPlanNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        throw e;
      }
    }
  );
};
