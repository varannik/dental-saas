'use client';

import type { ClinicalSession } from '@dental/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { newIdempotencyKey } from '../lib/patients';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';
import { inputClass, primaryButton } from './patient-form';

/** The patient's sessions, newest first, and the way to start today's session. */

const t = messages.sessions;

export function PatientSessions({ patientId, canStart }: { patientId: string; canStart: boolean }) {
  const router = useRouter();
  const { authed } = useSession();
  const [sessions, setSessions] = useState<ClinicalSession[] | null>(null);
  const [complaint, setComplaint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authed((token) => api.listSessions(token, patientId))
      .then((result) => active && setSessions(result.sessions))
      .catch(() => active && setSessions([]));
    return () => {
      active = false;
    };
  }, [authed, patientId]);

  const open = sessions?.find((session) => session.status === 'open');

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { patientId };
      if (complaint.trim()) body.chiefComplaint = complaint.trim();
      const session = await authed((token) => api.startSession(token, body, newIdempotencyKey()));
      router.push(`/sessions/${session.id}`);
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'session_open' ? t.alreadyOpen : t.failed
      );
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold">{t.title}</h2>

      {canStart && !open && (
        <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={start}>
          <label className="flex min-w-64 flex-1 flex-col gap-1.5">
            <span className="font-medium">
              {t.chiefComplaint} ({messages.patients.optional})
            </span>
            <input
              className={inputClass}
              placeholder={t.chiefComplaintPlaceholder}
              value={complaint}
              onChange={(event) => setComplaint(event.target.value)}
            />
          </label>
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? t.starting : t.start}
          </button>
        </form>
      )}
      {error && <p className="mb-3 text-red-700">{error}</p>}

      {sessions && sessions.length === 0 && <p className="text-neutral-500">{t.none}</p>}
      {sessions && sessions.length > 0 && (
        <ul className="flex flex-col divide-y divide-neutral-200">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/sessions/${session.id}`}
                className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-1 py-2 hover:bg-neutral-50"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {new Date(session.startedAt).toLocaleString('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                  {session.chiefComplaint && (
                    <span className="text-sm text-neutral-600">{session.chiefComplaint}</span>
                  )}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    session.status === 'open'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {session.status === 'open' ? t.openSession : t.statuses[session.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
