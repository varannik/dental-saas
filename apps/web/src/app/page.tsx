'use client';

import type { DashboardResponse } from '@dental/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AppFrame } from '../components/app-frame';
import { Elapsed } from '../components/elapsed';
import { inputClass, primaryButton } from '../components/patient-form';
import { RequireSession } from '../components/require-session';
import { api } from '../lib/api';
import { ageOn } from '../lib/patients';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';

/**
 * The dashboard (screen 2): find a patient, resume an open session, or go back to a patient
 * opened recently.
 */

const t = messages.dashboard;

export default function HomePage() {
  return (
    <RequireSession>
      <AppFrame>
        <Dashboard />
      </AppFrame>
    </RequireSession>
  );
}

const fullName = (p: { givenName: string; familyName: string }) => `${p.givenName} ${p.familyName}`;

function Dashboard() {
  const { state, authed } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [query, setQuery] = useState('');
  const permissions = state.status === 'signed_in' ? state.session.permissions : [];
  const canFind = permissions.includes('patient.read');
  const canSeeSessions = permissions.includes('session.read');

  useEffect(() => {
    if (!canFind) return;
    let active = true;
    authed((token) => api.dashboard(token))
      .then((result) => active && setData(result))
      .catch(() => active && setData({ openSessions: [], recentPatients: [] }));
    return () => {
      active = false;
    };
  }, [authed, canFind]);

  function find(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/patients?q=${encodeURIComponent(trimmed)}` : '/patients');
  }

  if (!canFind) {
    return (
      <h1 className="text-3xl font-semibold">
        {messages.shell.welcome}
        {state.status === 'signed_in' && `, ${state.session.user.email}`}
      </h1>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={find} className="flex flex-col gap-2">
        <label htmlFor="dashboard-find" className="text-3xl font-semibold">
          {t.find}
        </label>
        <div className="flex flex-wrap gap-3">
          <input
            id="dashboard-find"
            className={`${inputClass} min-w-0 flex-1 text-lg`}
            placeholder={t.findPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          <button type="submit" className={primaryButton}>
            {t.search}
          </button>
        </div>
      </form>

      {canSeeSessions && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">{t.openSessions}</h2>
          {data === null ? (
            <p className="text-neutral-500">{messages.shell.loading}</p>
          ) : data.openSessions.length === 0 ? (
            <p className="text-neutral-500">{t.noOpenSessions}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.openSessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-sky-300 bg-sky-50 px-4 py-3"
                >
                  <div className="flex flex-col">
                    <span className="text-lg font-semibold">
                      {fullName(session.patient)}
                      {session.mine && (
                        <span className="ml-2 rounded-full bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white uppercase">
                          {t.yours}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-neutral-600">
                      {messages.patients.fileNumber} #{session.patient.fileNumber} ·{' '}
                      {t.since.replace(
                        '{time}',
                        new Date(session.startedAt).toLocaleTimeString('en-GB', {
                          timeStyle: 'short',
                        })
                      )}{' '}
                      (<Elapsed since={session.startedAt} />)
                      {session.chiefComplaint && ` · ${session.chiefComplaint}`}
                    </span>
                  </div>
                  <Link
                    href={`/sessions/${session.id}`}
                    className={`${primaryButton} inline-flex items-center`}
                    aria-label={`${t.resume} ${fullName(session.patient)}`}
                  >
                    {t.resume}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">{t.recentPatients}</h2>
        {data === null ? (
          <p className="text-neutral-500">{messages.shell.loading}</p>
        ) : data.recentPatients.length === 0 ? (
          <p className="text-neutral-500">{t.noRecent}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.recentPatients.map((patient) => (
              <li key={patient.id}>
                <Link
                  href={`/patients/${patient.id}`}
                  className="flex min-h-12 flex-col rounded-lg border border-neutral-200 px-4 py-2 hover:bg-neutral-50"
                >
                  <span className="font-semibold">{fullName(patient)}</span>
                  <span className="text-sm text-neutral-600">
                    {messages.patients.age.replace(
                      '{age}',
                      String(ageOn(patient.birthDate, new Date()))
                    )}{' '}
                    · {messages.patients.fileNumber} #{patient.fileNumber} ·{' '}
                    {t.openedAt.replace(
                      '{date}',
                      new Date(patient.lastOpenedAt).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
