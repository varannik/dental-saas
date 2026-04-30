import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { recordClinicalAudit } from '../lib/audit.js';
import {
  chartEntryIdParamSchema,
  updateDentalChartEntryBodySchema,
} from '../schemas/dental-chart.schema.js';
import {
  ChartEntryNotFoundError,
  ChartEncounterMismatchError,
  softDeleteDentalChartEntry,
  updateDentalChartEntry,
} from '../services/dental-chart.service.js';

function requestIdFrom(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-request-id'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (Array.isArray(raw) && raw[0]) return String(raw[0]);
  return undefined;
}

export const chartEntriesRoute: FastifyPluginAsync = async (app) => {
  app.patch(
    '/:entryId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = chartEntryIdParamSchema.parse(request.params);
      const payload = updateDentalChartEntryBodySchema.parse(request.body);
      try {
        const entry = await updateDentalChartEntry(params.entryId, tenantId, userId, payload);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'DENTAL_CHART_ENTRY_UPDATED',
            resourceType: 'dental_chart_entry',
            resourceId: params.entryId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ entry });
      } catch (e) {
        if (e instanceof ChartEntryNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof ChartEncounterMismatchError) {
          return reply.code(400).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.delete(
    '/:entryId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = chartEntryIdParamSchema.parse(request.params);
      try {
        await softDeleteDentalChartEntry(params.entryId, tenantId, userId);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'DENTAL_CHART_ENTRY_DELETED',
            resourceType: 'dental_chart_entry',
            resourceId: params.entryId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.code(204).send();
      } catch (e) {
        if (e instanceof ChartEntryNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        throw e;
      }
    }
  );
};
