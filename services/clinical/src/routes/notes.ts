import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { recordClinicalAudit } from '../lib/audit.js';
import { clinicalNoteIdParamSchema, updateClinicalNoteBodySchema } from '../schemas/note.schema.js';
import {
  getClinicalNote,
  NoteConflictError,
  NoteForbiddenError,
  NoteNotFoundError,
  signClinicalNote,
  updateClinicalNote,
} from '../services/note.service.js';

function requestIdFrom(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-request-id'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (Array.isArray(raw) && raw[0]) return String(raw[0]);
  return undefined;
}

export const clinicalNotesByIdRoute: FastifyPluginAsync = async (app) => {
  app.get(
    '/:noteId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = clinicalNoteIdParamSchema.parse(request.params);
      const note = await getClinicalNote(params.noteId, tenantId);
      if (!note) return reply.code(404).send({ error: 'Clinical note not found.' });
      return reply.send({ note });
    }
  );

  app.patch(
    '/:noteId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = clinicalNoteIdParamSchema.parse(request.params);
      const payload = updateClinicalNoteBodySchema.parse(request.body);
      try {
        const note = await updateClinicalNote(params.noteId, tenantId, userId, payload);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'CLINICAL_NOTE_UPDATED',
            resourceType: 'clinical_note',
            resourceId: params.noteId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ note });
      } catch (e) {
        if (e instanceof NoteNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof NoteForbiddenError) {
          return reply.code(403).send({ error: e.message });
        }
        if (e instanceof NoteConflictError) {
          return reply.code(409).send({ error: e.message });
        }
        throw e;
      }
    }
  );

  app.post(
    '/:noteId/sign',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = clinicalNoteIdParamSchema.parse(request.params);
      try {
        const note = await signClinicalNote(params.noteId, tenantId, userId);
        const rid = requestIdFrom(request);
        try {
          await recordClinicalAudit({
            tenantId,
            userId,
            eventType: 'CLINICAL_NOTE_SIGNED',
            resourceType: 'clinical_note',
            resourceId: params.noteId,
            requestId: rid,
          });
        } catch {
          /* non-blocking */
        }
        return reply.send({ note });
      } catch (e) {
        if (e instanceof NoteNotFoundError) {
          return reply.code(404).send({ error: e.message });
        }
        if (e instanceof NoteForbiddenError) {
          return reply.code(403).send({ error: e.message });
        }
        if (e instanceof NoteConflictError) {
          return reply.code(409).send({ error: e.message });
        }
        throw e;
      }
    }
  );
};
