import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { recordClinicalAudit } from '../lib/audit.js';
import {
  createPatientBodySchema,
  listPatientsQuerySchema,
  patientIdParamSchema,
  searchPatientsQuerySchema,
  updatePatientBodySchema,
} from '../schemas/patient.schema.js';
import {
  createPatient,
  getPatient,
  getPatientHistory,
  listPatients,
  searchPatients,
  softDeletePatient,
  updatePatient,
} from '../services/patient.service.js';

function requestIdFrom(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-request-id'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (Array.isArray(raw) && raw[0]) return String(raw[0]);
  return undefined;
}

export const patientsRoute: FastifyPluginAsync = async (app) => {
  app.get(
    '/search',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const query = searchPatientsQuerySchema.parse(request.query);
      try {
        const result = await searchPatients(tenantId, query);
        return reply.send(result);
      } catch (e) {
        if (e instanceof Error && e.message === 'Invalid cursor') {
          return reply.code(400).send({ error: 'Invalid cursor.' });
        }
        throw e;
      }
    }
  );

  app.get('/', async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.code(401).send({ error: 'Missing or invalid auth context.' });
    }
    const query = listPatientsQuerySchema.parse(request.query);
    try {
      const result = await listPatients(tenantId, query);
      return reply.send(result);
    } catch (e) {
      if (e instanceof Error && e.message === 'Invalid cursor') {
        return reply.code(400).send({ error: 'Invalid cursor.' });
      }
      throw e;
    }
  });

  app.post('/', async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const tenantId = request.tenantId;
    const userId = request.userId;
    if (!tenantId || !userId) {
      return reply.code(401).send({ error: 'Missing or invalid auth context.' });
    }
    const payload = createPatientBodySchema.parse(request.body);
    const patient = await createPatient(tenantId, payload);
    const rid = requestIdFrom(request);
    try {
      await recordClinicalAudit({
        tenantId,
        userId,
        eventType: 'PATIENT_CREATED',
        resourceType: 'patient',
        resourceId: String(patient.id),
        requestId: rid,
      });
    } catch {
      /* non-blocking */
    }
    return reply.code(201).send({ patient });
  });

  app.get(
    '/:patientId/history',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = patientIdParamSchema.parse(request.params);
      const data = await getPatientHistory(params.patientId, tenantId);
      if (!data) return reply.code(404).send({ error: 'Patient not found.' });
      return reply.send(data);
    }
  );

  app.get(
    '/:patientId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = patientIdParamSchema.parse(request.params);
      const patient = await getPatient(params.patientId, tenantId);
      if (!patient) return reply.code(404).send({ error: 'Patient not found.' });
      return reply.send({ patient });
    }
  );

  app.patch(
    '/:patientId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = patientIdParamSchema.parse(request.params);
      const payload = updatePatientBodySchema.parse(request.body);
      const patient = await updatePatient(params.patientId, tenantId, payload);
      if (!patient) return reply.code(404).send({ error: 'Patient not found.' });
      const rid = requestIdFrom(request);
      try {
        await recordClinicalAudit({
          tenantId,
          userId,
          eventType: 'PATIENT_UPDATED',
          resourceType: 'patient',
          resourceId: params.patientId,
          requestId: rid,
        });
      } catch {
        /* non-blocking */
      }
      return reply.send({ patient });
    }
  );

  app.delete(
    '/:patientId',
    async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
      const tenantId = request.tenantId;
      const userId = request.userId;
      if (!tenantId || !userId) {
        return reply.code(401).send({ error: 'Missing or invalid auth context.' });
      }
      const params = patientIdParamSchema.parse(request.params);
      const ok = await softDeletePatient(params.patientId, tenantId);
      if (!ok) return reply.code(404).send({ error: 'Patient not found.' });
      const rid = requestIdFrom(request);
      try {
        await recordClinicalAudit({
          tenantId,
          userId,
          eventType: 'PATIENT_DELETED',
          resourceType: 'patient',
          resourceId: params.patientId,
          requestId: rid,
        });
      } catch {
        /* non-blocking */
      }
      return reply.code(204).send();
    }
  );
};
