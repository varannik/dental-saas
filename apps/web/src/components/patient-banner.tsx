'use client';

import type { HistoryEntry, Patient } from '@dental/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ageOn } from '../lib/patients';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';

const t = messages.patients;

/** Name, age, file number, archived state and allergy alerts, for the frame's patient banner. */
export function PatientBanner({
  patient,
  allergies,
}: {
  patient: Patient;
  /** Active allergies, or null when the user cannot see clinical history. */
  allergies: HistoryEntry[] | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="text-xl font-semibold">
        {patient.givenName} {patient.familyName}
      </span>
      <span>{t.age.replace('{age}', String(ageOn(patient.birthDate)))}</span>
      <span className="text-neutral-600">
        {t.fileNumber} #{patient.fileNumber}
      </span>
      {patient.status === 'archived' && (
        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium uppercase text-neutral-700">
          {t.archived}
        </span>
      )}
      {allergies && allergies.length === 0 && (
        <span className="text-sm text-neutral-500">{messages.history.noAllergiesRecorded}</span>
      )}
      {allergies?.map((allergy) => (
        <span
          key={allergy.id}
          className="rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white"
        >
          {messages.history.allergyAlert}: {allergy.label}
          {allergy.severity && allergy.severity !== 'unknown'
            ? ` (${messages.history.severities[allergy.severity]})`
            : ''}
        </span>
      ))}
    </div>
  );
}

/** Loads the patient and, for clinical roles, their active allergies for the banner. */
export function usePatientHeader(patientId: string | null) {
  const { state, authed } = useSession();
  const canReadClinical =
    state.status === 'signed_in' && state.session.permissions.includes('session.read');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [allergies, setAllergies] = useState<HistoryEntry[] | null>(null);

  const reload = useCallback(async () => {
    if (!patientId) return;
    const loaded = await authed((token) => api.getPatient(token, patientId));
    setPatient(loaded);
    if (canReadClinical) {
      const history = await authed((token) => api.getHistory(token, patientId));
      setAllergies(history.allergies);
    }
  }, [authed, canReadClinical, patientId]);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  return { patient, allergies: canReadClinical ? allergies : null, reload };
}
