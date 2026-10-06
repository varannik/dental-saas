'use client';

import type { DuplicateCandidate } from '@dental/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AppFrame } from '../../../components/app-frame';
import { FormActions, PatientFormFields, secondaryButton } from '../../../components/patient-form';
import { RequireSession } from '../../../components/require-session';
import { api, ApiError } from '../../../lib/api';
import {
  createBody,
  EMPTY_FORM,
  fieldErrors,
  newIdempotencyKey,
  type PatientForm,
} from '../../../lib/patients';
import { useSession } from '../../../lib/session';
import messages from '../../../messages/en.json';

const t = messages.patients;

export default function NewPatientPage() {
  return (
    <RequireSession>
      <AppFrame>
        <RegisterPatient />
      </AppFrame>
    </RequireSession>
  );
}

function RegisterPatient() {
  const router = useRouter();
  const { authed } = useSession();
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function register(force: boolean) {
    setBusy(true);
    setFailure(null);
    try {
      // A new key per attempt: "register anyway" is a different request from the first.
      const patient = await authed((token) =>
        api.createPatient(token, createBody(form, force), newIdempotencyKey())
      );
      router.push(`/patients/${patient.id}`);
    } catch (error) {
      setErrors(fieldErrors(error));
      if (error instanceof ApiError && error.code === 'possible_duplicate') {
        setDuplicates((error.body.candidates as DuplicateCandidate[]) ?? []);
      } else if (error instanceof ApiError && error.status === 403) {
        setFailure(t.noPermission);
      } else if (!(error instanceof ApiError && error.code === 'validation_failed')) {
        setFailure(t.failed);
      }
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/patients" className="text-neutral-600 hover:text-neutral-900">
        ← {t.back}
      </Link>
      <h1 className="text-3xl font-semibold">{t.newTitle}</h1>

      {duplicates ? (
        <section
          role="alert"
          className="flex flex-col gap-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-6"
        >
          <div>
            <h2 className="text-xl font-semibold">{t.duplicateTitle}</h2>
            <p className="text-neutral-700">{t.duplicateHint}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {duplicates.map((candidate) => (
              <li
                key={candidate.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-4 py-3"
              >
                <span>
                  <span className="text-lg font-medium">
                    {candidate.givenName} {candidate.familyName}
                  </span>
                  <span className="ml-3 text-sm text-neutral-600">
                    {t.fileNumber} #{candidate.fileNumber} · {t.born} {candidate.birthDate}
                  </span>
                </span>
                <Link
                  href={`/patients/${candidate.id}`}
                  className={`${secondaryButton} flex items-center`}
                >
                  {t.open}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => void register(true)}
            >
              {t.registerAnyway}
            </button>
            <button
              type="button"
              className="h-12 px-3 text-neutral-600 hover:text-neutral-900"
              onClick={() => setDuplicates(null)}
            >
              {t.cancel}
            </button>
          </div>
        </section>
      ) : (
        <form
          className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void register(false);
          }}
        >
          <PatientFormFields form={form} onChange={setForm} errors={errors} />
          {failure && (
            <p role="alert" className="text-red-700">
              {failure}
            </p>
          )}
          <FormActions
            busy={busy}
            saveLabel={t.register}
            onCancel={() => router.push('/patients')}
          />
        </form>
      )}
    </div>
  );
}
