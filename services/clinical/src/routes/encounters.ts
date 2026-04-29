import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { recordClinicalAudit } from '../lib/audit.js';
import { createEncounterBodySchema, encounterIdParamSchema } from '../schemas/encounter.schema.js';
import {
  createClinicalNoteBodySchema,
  encounterIdParamForNotesSchema,
} from '../schemas/note.schema.js';
import {
  EncounterNotFoundError,
  EncounterStateError,
  beginEncounterInProgress,
  checkInEncounter,
  checkOutEncounter,
  createEncounter,
  getEncounter,
} from '../services/encounter.service.js';
import { createClinicalNote, listClinicalNotesForEncounter } from '../services/note.service.js';

function requestIdFrom(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-request-id'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (Array.isArray(raw) && raw[0]) return String(raw[0]);
  return undefined;
}

export const encountersRoute: FastifyPluginAsync = async (app) => {
  app.post('/', async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const tenantId = request.tenantId;
    const userId = request.userId;
    if (!tenantId || !userId) {
      return reply.code(401).send({ error: 'Missing or invalid auth context.' });
    }
    try {
      const payload = createEncounterBodySchema.parse(request.body);
      const encounter = await createEncounter(tenantId, payload);
      const rid = requestIdFrom(request);
      try {
        await recordClinicalAudit({
          tenantId,
          userId,
          eventType: 'ENCOUNTER_CREATED',
          resourceType: 'encounter',
          resourceId: String(encounter.id),
          requestId: rid,
        });
      } catch {
        /* non-blocking */
      }
      return reply.code(201).send({ encounter });
    } catch (e) {
      if (e instanceof EncounterStateError) {
        return reply.code(e.statusCode).send({ error: e.message });
      }
      throw e;
    }
  });

  app.get(
    '/:encounterId/notes',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = encounterIdParamForNotesSchema.parse(request.params);
      const notes = await listClinicalNotesForEncounter(params.encounterId, tenantId);
      if (!notes) return reply.code(404).send({ error: 'Encounter not found.' });
      return reply.send({ notes });
    }
  );

  app.post(
    '/:encounterId/notes',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = encounterIdParamForNotesSchema.parse(request.params);
      try {
        const payload = createClinicalNoteBodySchema.parse(request.body);
        const note = await createClinicalNote(tenantId, params.encounterId, userId, payload);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'CLINICAL_NOTE_CREATED',
            resourceType: 'clinical_note',
            resourceId: String(note.id),
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.code(201).send({ note });
      } catch (e) {
        if (e instanceof EncounterNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.get(
    '/:encounterId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = encounterIdParamSchema.parse(request.params);
      const encounter = await getEncounter(params.encounterId, tenantId);
      if (!encounter) return reply.code(404).send({ error: 'Encounter not found.' });
      return reply.send({ encounter });
    }
  );

  app.patch(
    '/:encounterId/check-in',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = encounterIdParamSchema.parse(request.params);
      try {
        const encounter = await checkInEncounter(params.encounterId, tenantId);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'ENCOUNTER_CHECKED_IN',
            resourceType: 'encounter',
            resourceId: params.encounterId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ encounter });
      } catch (e) {
        if (e instanceof EncounterNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof EncounterStateError) {
          return reply.code(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.patch(
    '/:encounterId/in-progress',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = encounterIdParamSchema.parse(request.params);
      try {
        const encounter = await beginEncounterInProgress(params.encounterId, tenantId);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'ENCOUNTER_IN_PROGRESS',
            resourceType: 'encounter',
            resourceId: params.encounterId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ encounter });
      } catch (e) {
        if (e instanceof EncounterNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof EncounterStateError) {
          return reply.code(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.patch(
    '/:encounterId/check-out',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = encounterIdParamSchema.parse(request.params);
      try {
        const encounter = await checkOutEncounter(params.encounterId, tenantId);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'ENCOUNTER_CHECKED_OUT',
            resourceType: 'encounter',
            resourceId: params.encounterId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ encounter });
      } catch (e) {
        if (e instanceof EncounterNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof EncounterStateError) {
          return reply.code(e.statusCode).send({ error: e.message });
        }
        throw e;
      }
    }
  );
};
