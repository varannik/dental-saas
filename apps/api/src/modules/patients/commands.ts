import {
  type DuplicateCandidate,
  patientCreate,
  patientUpdate,
  type PatientCreate,
  type PatientUpdate,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import type { PoolClient } from '../../platform/db.js';
import { HttpProblem } from '../../platform/http-problem.js';
import type { SecretBox } from '../../platform/secret-box.js';
import type { CommandBus, HandlerContext, HandlerOutcome } from '../commands/bus.js';
import {
  normalizeNationalId,
  PATIENT_COLUMNS,
  phoneDigits,
  toView,
  type PatientRow,
  type PatientView,
} from './model.js';

/**
 * patient.create and patient.update. Creating warns about likely duplicates: the same national
 * ID, or the same date of birth or phone with a similar name. The national ID is encrypted, and
 * audit entries record only that it was set, changed or removed.
 */

const NAME_SIMILARITY = 0.5;

async function findDuplicates(
  client: PoolClient,
  candidate: {
    name: string;
    birthDate: string;
    phoneDigits: string | null;
    nationalIdIndex: string | null;
  }
): Promise<DuplicateCandidate[]> {
  const { rows } = await client.query<{
    id: string;
    file_number: number;
    given_name: string;
    family_name: string;
    birth_date: string;
  }>(
    `SELECT id, file_number, given_name, family_name, birth_date
     FROM clinical.patients
     WHERE status = 'active' AND (
       ($1::text IS NOT NULL AND national_id_index = $1)
       OR (
         similarity(search_name, clinical.normalize_name($2)) >= $5
         AND (birth_date = $3::date OR ($4::text IS NOT NULL AND phone_digits = $4))
       )
     )
     ORDER BY file_number
     LIMIT 5`,
    [
      candidate.nationalIdIndex,
      candidate.name,
      candidate.birthDate,
      candidate.phoneDigits,
      NAME_SIMILARITY,
    ]
  );
  return rows.map((row) => ({
    id: row.id,
    fileNumber: row.file_number,
    givenName: row.given_name,
    familyName: row.family_name,
    birthDate: row.birth_date,
  }));
}

/** The next file number for the clinic; the counter row stays locked until commit. */
async function nextFileNumber(client: PoolClient, clinicId: string): Promise<number> {
  const { rows } = await client.query<{ last_number: number }>(
    `INSERT INTO clinical.patient_numbers (clinic_id, last_number) VALUES ($1, 1)
     ON CONFLICT (clinic_id) DO UPDATE SET last_number = clinical.patient_numbers.last_number + 1
     RETURNING last_number`,
    [clinicId]
  );
  return rows[0]!.last_number;
}

export function createPatientHandlers(secrets: SecretBox) {
  async function create(
    { client, actor }: HandlerContext,
    payload: PatientCreate
  ): Promise<HandlerOutcome<PatientView>> {
    const nationalId = payload.nationalId ? normalizeNationalId(payload.nationalId) : null;
    const nationalIdIndex = nationalId ? secrets.index(nationalId) : null;
    const digits = payload.phone ? phoneDigits(payload.phone) : null;

    const duplicates = await findDuplicates(client, {
      name: `${payload.givenName} ${payload.familyName}`,
      birthDate: payload.birthDate,
      phoneDigits: digits,
      nationalIdIndex,
    });
    if (duplicates.length > 0 && !payload.force) {
      throw new HttpProblem(409, 'possible_duplicate', 'This patient may already be registered.', {
        candidates: duplicates,
      });
    }

    const fileNumber = await nextFileNumber(client, actor.clinicId);
    const row = (
      await client.query<PatientRow>(
        `INSERT INTO clinical.patients
           (id, clinic_id, file_number, given_name, family_name, birth_date, sex, phone,
            phone_digits, email, national_id_encrypted, national_id_index, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING ${PATIENT_COLUMNS}`,
        [
          uuidv7(),
          actor.clinicId,
          fileNumber,
          payload.givenName,
          payload.familyName,
          payload.birthDate,
          payload.sex,
          payload.phone ?? null,
          digits,
          payload.email ?? null,
          nationalId ? secrets.encrypt(nationalId) : null,
          nationalIdIndex,
          actor.userId,
        ]
      )
    ).rows[0]!;

    return {
      result: toView(row, secrets),
      audit: [
        {
          action: patientCreate.type,
          entity: 'patient',
          entityId: row.id,
          before: null,
          after: {
            fileNumber,
            givenName: row.given_name,
            familyName: row.family_name,
            birthDate: row.birth_date,
            sex: row.sex,
            phone: row.phone,
            email: row.email,
            nationalId: nationalId ? 'set' : undefined,
            // Created although these possible duplicates were shown.
            duplicatesOverridden: duplicates.length > 0 ? duplicates.map((d) => d.id) : undefined,
          },
        },
      ],
    };
  }

  async function update(
    { client }: HandlerContext,
    payload: PatientUpdate
  ): Promise<HandlerOutcome<PatientView>> {
    const current = (
      await client.query<PatientRow>(
        `SELECT ${PATIENT_COLUMNS} FROM clinical.patients WHERE id = $1 FOR UPDATE`,
        [payload.patientId]
      )
    ).rows[0];
    if (!current) throw new HttpProblem(404, 'not_found', 'Patient not found.');
    if (current.version !== payload.version) {
      throw new HttpProblem(409, 'version_conflict', 'The patient was changed by someone else.', {
        currentVersion: current.version,
      });
    }

    const next = { ...current };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const change = (key: string, column: keyof PatientRow, value: unknown) => {
      if (value === undefined || value === current[column]) return;
      before[key] = current[column];
      after[key] = value;
      (next as Record<string, unknown>)[column] = value;
    };
    change('givenName', 'given_name', payload.givenName);
    change('familyName', 'family_name', payload.familyName);
    change('birthDate', 'birth_date', payload.birthDate);
    change('sex', 'sex', payload.sex);
    change('email', 'email', payload.email);
    change('status', 'status', payload.status);
    if (payload.phone !== undefined && payload.phone !== current.phone) {
      change('phone', 'phone', payload.phone);
      next.phone_digits = payload.phone === null ? null : phoneDigits(payload.phone);
    }
    if (payload.nationalId !== undefined) {
      const normalized =
        payload.nationalId === null ? null : normalizeNationalId(payload.nationalId);
      const index = normalized === null ? null : secrets.index(normalized);
      if (index !== current.national_id_index) {
        before.nationalId = current.national_id_index ? 'set' : null;
        after.nationalId = index ? (current.national_id_index ? 'changed' : 'set') : 'removed';
        next.national_id_index = index;
        next.national_id_encrypted = normalized === null ? null : secrets.encrypt(normalized);
      }
    }
    if (Object.keys(after).length === 0) return { result: toView(current, secrets), audit: [] };

    const updated = (
      await client.query<PatientRow>(
        `UPDATE clinical.patients
         SET given_name = $2, family_name = $3, birth_date = $4, sex = $5, phone = $6,
             phone_digits = $7, email = $8, national_id_encrypted = $9, national_id_index = $10,
             status = $11, version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${PATIENT_COLUMNS}`,
        [
          current.id,
          next.given_name,
          next.family_name,
          next.birth_date,
          next.sex,
          next.phone,
          next.phone_digits,
          next.email,
          next.national_id_encrypted,
          next.national_id_index,
          next.status,
        ]
      )
    ).rows[0]!;

    return {
      result: toView(updated, secrets),
      audit: [
        {
          action: payload.status === 'archived' ? 'patient.archive' : patientUpdate.type,
          entity: 'patient',
          entityId: current.id,
          before: { ...before, version: current.version },
          after: { ...after, version: updated.version },
        },
      ],
    };
  }

  return { create, update };
}

export function registerPatientCommands(bus: CommandBus, secrets: SecretBox) {
  const handlers = createPatientHandlers(secrets);
  bus.register(patientCreate, handlers.create);
  bus.register(patientUpdate, handlers.update);
}
