import type {
  ActivityResponse,
  DashboardResponse,
  OpenSessionListing,
  RecentPatient,
} from '@dental/contracts';
import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../platform/auth.js';
import { withClinic, type Pool } from '../../platform/db.js';
import { recordAccess } from '../audit/chain.js';
import type { TokenService } from '../identity/tokens.js';

/**
 * The start of the day and the activity rail (C7, spec section K).
 *
 *   GET /v1/dashboard   open sessions in the clinic and the patients I opened recently
 *   GET /v1/activity    my last ten executed commands
 */

const RECENT_PATIENTS = 8;
const ACTIVITY = 10;

interface PatientColumns {
  patient_id: string;
  file_number: number;
  given_name: string;
  family_name: string;
  birth_date: string;
}

const patientOf = (row: PatientColumns) => ({
  id: row.patient_id,
  fileNumber: row.file_number,
  givenName: row.given_name,
  familyName: row.family_name,
  birthDate: row.birth_date,
});

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  options: { pool: Pool; tokens: TokenService }
) {
  const { pool, tokens } = options;
  const signedIn = authenticate(tokens);

  app.get(
    '/v1/dashboard',
    { preHandler: [signedIn, requirePermission('patient.read')] },
    async (request): Promise<DashboardResponse> => {
      const auth = request.auth!;
      return withClinic(pool, auth.clinicId, async (client) => {
        await recordAccess(client, {
          clinicId: auth.clinicId,
          actorId: auth.userId,
          purpose: 'dashboard',
          requestId: request.id,
        });

        let openSessions: OpenSessionListing[] = [];
        if (auth.permissions.includes('session.read')) {
          const { rows } = await client.query<
            PatientColumns & {
              id: string;
              chief_complaint: string | null;
              started_at: Date;
              provider_id: string | null;
            }
          >(
            `SELECT s.id, s.chief_complaint, s.started_at, s.provider_id, s.patient_id,
                    p.file_number, p.given_name, p.family_name, p.birth_date::text AS birth_date
             FROM clinical.clinical_sessions AS s
             JOIN clinical.patients AS p ON p.id = s.patient_id
             WHERE s.status = 'open'
             ORDER BY s.started_at DESC`
          );
          openSessions = rows.map((row) => ({
            id: row.id,
            patient: patientOf(row),
            chiefComplaint: row.chief_complaint,
            startedAt: row.started_at.toISOString(),
            mine: row.provider_id === auth.userId,
          }));
        }

        const recent = await client.query<PatientColumns & { last_opened_at: Date }>(
          `SELECT p.id AS patient_id, p.file_number, p.given_name, p.family_name,
                  p.birth_date::text AS birth_date, a.last_opened_at
           FROM (
             SELECT patient_id, max(at) AS last_opened_at
             FROM audit.access_log
             WHERE actor_id = $1 AND patient_id IS NOT NULL
             GROUP BY patient_id
           ) AS a
           JOIN clinical.patients AS p ON p.id = a.patient_id
           WHERE p.status = 'active'
           ORDER BY a.last_opened_at DESC
           LIMIT $2`,
          [auth.userId, RECENT_PATIENTS]
        );
        const recentPatients: RecentPatient[] = recent.rows.map((row) => ({
          ...patientOf(row),
          lastOpenedAt: row.last_opened_at.toISOString(),
        }));

        return { openSessions, recentPatients };
      });
    }
  );

  app.get('/v1/activity', { preHandler: signedIn }, async (request): Promise<ActivityResponse> => {
    const auth = request.auth!;
    return withClinic(pool, auth.clinicId, async (client) => {
      const { rows } = await client.query<{
        id: string;
        type: string;
        source: 'gui' | 'voice' | 'system';
        created_at: Date;
        patient_id: string | null;
        session_id: string | null;
        tooth: string | null;
      }>(
        `SELECT c.id, c.type, c.source, c.created_at,
                coalesce(c.payload->>'patientId', c.result->>'patientId', s.patient_id::text,
                         CASE WHEN c.type = 'patient.create' THEN c.result->>'id' END)
                  AS patient_id,
                coalesce(c.payload->>'sessionId', c.result->>'sessionId',
                         CASE WHEN c.type = 'session.start' THEN c.result->>'id' END)
                  AS session_id,
                coalesce(c.payload->>'tooth', c.result->>'tooth') AS tooth
         FROM voice.commands AS c
         LEFT JOIN clinical.clinical_sessions AS s ON s.id::text = c.payload->>'sessionId'
         WHERE c.actor_id = $1 AND c.status = 'executed'
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT $2`,
        [auth.userId, ACTIVITY]
      );
      return {
        entries: rows.map((row) => ({
          id: row.id,
          type: row.type,
          source: row.source,
          at: row.created_at.toISOString(),
          patientId: row.patient_id,
          sessionId: row.session_id,
          tooth: row.tooth,
        })),
      };
    });
  });
}
