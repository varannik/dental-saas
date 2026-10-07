'use client';

import type { PatientHit } from '@dental/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppFrame } from '../../components/app-frame';
import { inputClass, primaryButton } from '../../components/patient-form';
import { RequireSession } from '../../components/require-session';
import { api, ApiError } from '../../lib/api';
import { ageOn } from '../../lib/patients';
import { useSession } from '../../lib/session';
import messages from '../../messages/en.json';

const t = messages.patients;
const SEARCH_DELAY_MS = 250;

export default function PatientsPage() {
  return (
    <RequireSession>
      <AppFrame focus={{ patientId: null }}>
        <PatientSearch />
      </AppFrame>
    </RequireSession>
  );
}

function PatientSearch() {
  const { state, authed } = useSession();
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [results, setResults] = useState<PatientHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRegister =
    state.status === 'signed_in' && state.session.permissions.includes('patient.write');

  // The dashboard hands over its search as ?q=.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) setQuery(initial);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      authed((token) => api.searchPatients(token, trimmed, { includeArchived }))
        .then((response) => {
          if (!active) return;
          setResults(response.results);
          setError(null);
        })
        .catch((failure: unknown) => {
          if (!active) return;
          setError(
            failure instanceof ApiError && failure.status === 403 ? t.noPermission : t.failed
          );
        });
    }, SEARCH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [authed, includeArchived, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{t.title}</h1>
        {canRegister && (
          <Link href="/patients/new" className={`${primaryButton} flex items-center`}>
            {t.register}
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="patient-search" className="font-medium">
          {t.searchLabel}
        </label>
        <input
          id="patient-search"
          type="search"
          autoFocus
          autoComplete="off"
          className={`${inputClass} text-xl`}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-500">
          <span>{t.searchHint}</span>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            {t.includeArchived}
          </label>
        </div>
      </div>

      {error && <p className="text-red-700">{error}</p>}
      {results && results.length === 0 && <p className="text-neutral-500">{t.noResults}</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {results.map((patient) => (
            <li key={patient.id}>
              <Link
                href={`/patients/${patient.id}`}
                className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3 hover:bg-neutral-50"
              >
                <span className="flex items-baseline gap-3">
                  <span className="text-xl font-medium">
                    {patient.givenName} {patient.familyName}
                  </span>
                  {patient.status === 'archived' && (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium uppercase text-neutral-700">
                      {t.archived}
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap gap-x-5 text-sm text-neutral-600">
                  <span>
                    {t.fileNumber} #{patient.fileNumber}
                  </span>
                  <span>
                    {t.born} {patient.birthDate} ·{' '}
                    {t.age.replace('{age}', String(ageOn(patient.birthDate)))}
                  </span>
                  {patient.phone && <span>{patient.phone}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
