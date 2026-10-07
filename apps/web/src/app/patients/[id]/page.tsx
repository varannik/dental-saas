'use client';

import type { HistoryEntry, Patient, PatientHistory } from '@dental/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AppFrame } from '../../../components/app-frame';
import { FormActions, PatientFormFields, secondaryButton } from '../../../components/patient-form';
import { PatientBanner } from '../../../components/patient-banner';
import { PatientHistorySection } from '../../../components/patient-history';
import { PatientSessions } from '../../../components/patient-sessions';
import { RequireSession } from '../../../components/require-session';
import { TreatmentPlanCard } from '../../../components/treatment-plan';
import { api, ApiError } from '../../../lib/api';
import {
  fieldErrors,
  formFrom,
  newIdempotencyKey,
  updateBody,
  type PatientForm,
} from '../../../lib/patients';
import { useSession } from '../../../lib/session';
import messages from '../../../messages/en.json';

const t = messages.patients;

export default function PatientPage() {
  return (
    <RequireSession>
      <PatientProfile />
    </RequireSession>
  );
}

function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const { state, authed } = useSession();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PatientForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const permissions = state.status === 'signed_in' ? state.session.permissions : [];
  const canEdit = permissions.includes('patient.write');
  // History is clinical content: receptionists cannot see it (ADR 0002).
  const canReadHistory = permissions.includes('session.read');
  const canWriteHistory = permissions.includes('history.write');
  const [history, setHistory] = useState<PatientHistory | null>(null);
  const [activeAllergies, setActiveAllergies] = useState<HistoryEntry[] | null>(null);
  const [includeEnded, setIncludeEnded] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!canReadHistory) return;
    try {
      const loaded = await authed((token) => api.getHistory(token, id, includeEnded));
      setHistory(loaded);
      setActiveAllergies(loaded.allergies.filter((entry) => entry.status === 'active'));
    } catch {
      setHistory(null);
    }
  }, [authed, canReadHistory, id, includeEnded]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const load = useCallback(
    () =>
      authed((token) => api.getPatient(token, id))
        .then((loaded) => {
          setPatient(loaded);
          setLoadError(null);
          return loaded;
        })
        .catch((error: unknown) => {
          setLoadError(
            error instanceof ApiError && error.status === 404
              ? t.notFound
              : error instanceof ApiError && error.status === 403
                ? t.noPermission
                : t.failed
          );
          return null;
        }),
    [authed, id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function save(body: Record<string, unknown>) {
    if (!patient) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await authed((token) =>
        api.updatePatient(token, patient.id, body, newIdempotencyKey())
      );
      setPatient(updated);
      setEditing(false);
      setErrors({});
    } catch (error) {
      setErrors(fieldErrors(error));
      if (error instanceof ApiError && error.code === 'version_conflict') {
        const latest = await load();
        if (latest) setForm(formFrom(latest));
        setNotice(t.conflict);
      } else if (!(error instanceof ApiError && error.code === 'validation_failed')) {
        setNotice(t.failed);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <AppFrame>
        <p className="text-red-700">{loadError}</p>
        <Link href="/patients" className="mt-4 inline-block text-neutral-600 underline">
          {t.back}
        </Link>
      </AppFrame>
    );
  }
  if (!patient) {
    return (
      <AppFrame>
        <p className="text-neutral-500">{messages.shell.loading}</p>
      </AppFrame>
    );
  }

  const archived = patient.status === 'archived';
  return (
    <AppFrame
      patientBanner={
        <PatientBanner patient={patient} allergies={canReadHistory ? activeAllergies : null} />
      }
    >
      <div className="flex flex-col gap-6">
        <Link href="/patients" className="text-neutral-600 hover:text-neutral-900">
          ← {t.back}
        </Link>

        {notice && (
          <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">
            {notice}
          </p>
        )}

        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t.details}</h2>
            {canEdit && !editing && (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    setForm(formFrom(patient));
                    setErrors({});
                    setEditing(true);
                  }}
                >
                  {t.edit}
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy}
                  onClick={() => {
                    if (archived || window.confirm(t.archiveConfirm)) {
                      void save({
                        version: patient.version,
                        status: archived ? 'active' : 'archived',
                      });
                    }
                  }}
                >
                  {archived ? t.restore : t.archive}
                </button>
              </div>
            )}
          </div>

          {editing && form ? (
            <form
              className="flex flex-col gap-6"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void save(updateBody(patient, form));
              }}
            >
              <PatientFormFields
                form={form}
                onChange={setForm}
                errors={errors}
                nationalIdMasked={patient.nationalId}
              />
              <FormActions busy={busy} onCancel={() => setEditing(false)} />
            </form>
          ) : (
            <dl className="grid gap-5 sm:grid-cols-3">
              <Detail label={t.birthDate}>{patient.birthDate}</Detail>
              <Detail label={t.sex}>
                {t.sexOptions[patient.sex as keyof typeof t.sexOptions] ?? patient.sex}
              </Detail>
              <Detail label={t.fileNumber}>#{patient.fileNumber}</Detail>
              <Detail label={t.phone}>{patient.phone ?? t.notSet}</Detail>
              <Detail label={t.email}>{patient.email ?? t.notSet}</Detail>
              <Detail label={t.nationalId}>
                <span className="font-mono">{patient.nationalId ?? t.notSet}</span>
              </Detail>
            </dl>
          )}
        </section>

        {canReadHistory && (
          <PatientSessions
            patientId={patient.id}
            canStart={permissions.includes('session.write') && !archived}
          />
        )}

        {canReadHistory && (
          <TreatmentPlanCard
            patientId={patient.id}
            canEdit={permissions.includes('plan.write') && !archived}
          />
        )}

        {canReadHistory && history && (
          <PatientHistorySection
            patientId={patient.id}
            history={history}
            canWrite={canWriteHistory && !archived}
            includeEnded={includeEnded}
            onIncludeEndedChange={setIncludeEnded}
            onChanged={() => void loadHistory()}
          />
        )}
      </div>
    </AppFrame>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-xl">{children}</dd>
    </div>
  );
}
