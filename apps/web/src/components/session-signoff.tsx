'use client';

import type { FindingCode, SessionDetail } from '@dental/contracts';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { newIdempotencyKey } from '../lib/patients';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';
import { inputClass, primaryButton } from './patient-form';
import { describeProcedure } from './session-procedures';

/**
 * The end of a session (C6, screen 9): the summary of a completed session, signing it, and
 * amending it once signed. Signing is a click by a dentist, never voice alone (risk R3). A
 * signed session is locked; corrections are added as amendments with a reason.
 */

const t = messages.signoff;
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function usePermissions() {
  const { state } = useSession();
  return state.status === 'signed_in'
    ? { permissions: state.session.permissions, userId: state.session.user.id }
    : { permissions: [] as string[], userId: null };
}

export function SessionSummary({ session }: { session: SessionDetail }) {
  const performed = session.procedures.filter((p) => p.status === 'completed');
  const diagnoses = session.diagnoses.filter((d) => d.status === 'confirmed');
  const findings = session.findings;
  const diagnosisName = (code: string, label: string | null) =>
    code === 'other' && label
      ? label
      : (messages.diagnoses.codes[code as keyof typeof messages.diagnoses.codes] ?? code);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-xl font-semibold">{t.summary}</h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-neutral-500">{t.procedures}</dt>
          <dd>
            {performed.length === 0
              ? t.nothing
              : performed
                  .map((p) => `${p.procedureType.name} ${describeProcedure(p)}`.trim())
                  .join(', ')}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-neutral-500">{t.diagnoses}</dt>
          <dd>
            {diagnoses.length === 0
              ? t.nothing
              : diagnoses
                  .map(
                    (d) =>
                      `${diagnosisName(d.code, d.label)}${d.tooth ? ` ${messages.diagnoses.tooth} ${d.tooth}` : ''}`
                  )
                  .join(', ')}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-neutral-500">{t.findings}</dt>
          <dd>
            {findings.length === 0
              ? t.nothing
              : findings
                  .map(
                    (f) =>
                      `${f.tooth}${f.surface ?? ''} ${(messages.sessions.codes[f.code as FindingCode] ?? f.code).toLowerCase()}`
                  )
                  .join(', ')}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-neutral-500">{t.notes}</dt>
          <dd>
            {session.notes.length === 0
              ? t.nothing
              : session.notes.length === 1
                ? t.noteOne
                : t.noteCount.replace('{count}', String(session.notes.length))}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function SignPanel({
  session,
  onChanged,
}: {
  session: SessionDetail;
  onChanged: () => Promise<void>;
}) {
  const { authed } = useSession();
  const { permissions } = usePermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSign = permissions.includes('session.sign');

  async function sign() {
    if (!window.confirm(t.signConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      await authed((token) => api.signSession(token, session.id, newIdempotencyKey()));
      await onChanged();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status !== 500 ? failure.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-neutral-900 px-4 py-3">
      <p>{canSign ? t.signHint : t.dentistSigns}</p>
      {canSign && (
        <button type="button" className={primaryButton} disabled={busy} onClick={() => void sign()}>
          {busy ? t.signing : t.sign}
        </button>
      )}
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function SignedRecord({
  session,
  onChanged,
}: {
  session: SessionDetail;
  onChanged: () => Promise<void>;
}) {
  const { permissions, userId } = usePermissions();
  const signedAt = session.signedAt ? dateTime(session.signedAt) : '';

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
      <div>
        <p className="text-lg font-semibold">
          {(session.signedBy === userId ? t.signedByYou : t.signed).replace('{date}', signedAt)}
        </p>
        <p className="text-neutral-600">{t.signedLock}</p>
      </div>
      {session.amendments.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">{t.amendments}</h3>
          <ol className="flex flex-col gap-2">
            {session.amendments.map((amendment) => (
              <li
                key={amendment.id}
                className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-2"
              >
                <p className="font-medium">{amendment.reason}</p>
                <p className="text-xs text-neutral-600">{dateTime(amendment.amendedAt)}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      {permissions.includes('session.amend') && (
        <AmendmentForm sessionId={session.id} onChanged={onChanged} />
      )}
    </section>
  );
}

function AmendmentForm({
  sessionId,
  onChanged,
}: {
  sessionId: string;
  onChanged: () => Promise<void>;
}) {
  const { authed } = useSession();
  const [reason, setReason] = useState('');
  const [addendum, setAddendum] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length >= 3 && addendum.trim().length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !window.confirm(t.amendConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      await authed((token) =>
        api.amendSession(
          token,
          sessionId,
          {
            reason: reason.trim(),
            actions: [{ type: 'note.add', payload: { type: 'clinical', body: addendum.trim() } }],
          },
          newIdempotencyKey()
        )
      );
      setReason('');
      setAddendum('');
      await onChanged();
    } catch (failure) {
      const issue =
        failure instanceof ApiError
          ? (failure.body.issues as { message: string }[] | undefined)?.[0]?.message
          : undefined;
      setError(issue ?? t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4"
      onSubmit={submit}
    >
      <h3 className="font-semibold">{t.amend}</h3>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t.reason}</span>
        <input
          className={inputClass}
          placeholder={t.reasonPlaceholder}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t.addendum}</span>
        <textarea
          className={`${inputClass} h-28 py-2`}
          placeholder={t.addendumPlaceholder}
          value={addendum}
          onChange={(event) => setAddendum(event.target.value)}
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" className={primaryButton} disabled={busy || !ready}>
        {t.submit}
      </button>
    </form>
  );
}
