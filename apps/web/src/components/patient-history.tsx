'use client';

import {
  ALLERGY_SEVERITIES,
  HISTORY_END_REASONS,
  HISTORY_GROUP,
  type HistoryEntry,
  type HistoryKind,
  type PatientHistory,
} from '@dental/contracts';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { newIdempotencyKey } from '../lib/patients';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';
import { inputClass, primaryButton, secondaryButton } from './patient-form';

/**
 * The patient's medical history in four groups. Entries are added and ended, never edited:
 * a correction is "entered in error" plus a new entry (ADR 0002).
 */

const t = messages.history;

/** Allergies first: they are the safety-critical group. */
const ORDER: HistoryKind[] = ['allergy', 'condition', 'medication', 'risk_factor'];

export function PatientHistorySection({
  patientId,
  history,
  canWrite,
  includeEnded,
  onIncludeEndedChange,
  onChanged,
}: {
  patientId: string;
  history: PatientHistory;
  canWrite: boolean;
  includeEnded: boolean;
  onIncludeEndedChange: (value: boolean) => void;
  /** Called after a change so the page reloads the history and the banner. */
  onChanged: () => void;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t.title}</h2>
        <label className="flex min-h-11 items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            className="size-5"
            checked={includeEnded}
            onChange={(event) => onIncludeEndedChange(event.target.checked)}
          />
          {t.showEnded}
        </label>
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        {ORDER.map((kind) => (
          <HistoryGroup
            key={kind}
            kind={kind}
            patientId={patientId}
            entries={history[HISTORY_GROUP[kind]]}
            canWrite={canWrite}
            onChanged={onChanged}
          />
        ))}
      </div>
    </section>
  );
}

function HistoryGroup({
  kind,
  patientId,
  entries,
  canWrite,
  onChanged,
}: {
  kind: HistoryKind;
  patientId: string;
  entries: HistoryEntry[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const group = HISTORY_GROUP[kind];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-lg font-semibold ${kind === 'allergy' ? 'text-red-800' : ''}`}>
          {t.groups[group]}
        </h3>
        {canWrite && !adding && (
          <button
            type="button"
            className="h-11 rounded-lg px-3 font-medium text-neutral-700 hover:bg-neutral-100"
            onClick={() => setAdding(true)}
          >
            + {t.add.replace('{kind}', t.kinds[kind])}
          </button>
        )}
      </div>

      {entries.length === 0 && !adding && <p className="text-neutral-500">{t.none}</p>}
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <HistoryItem
            key={entry.id}
            entry={entry}
            patientId={patientId}
            canWrite={canWrite}
            onChanged={onChanged}
          />
        ))}
      </ul>

      {adding && (
        <AddEntryForm
          kind={kind}
          patientId={patientId}
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function HistoryItem({
  entry,
  patientId,
  canWrite,
  onChanged,
}: {
  entry: HistoryEntry;
  patientId: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const { authed } = useSession();
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState<string>('resolved');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ended = entry.status === 'ended';

  async function endEntry(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authed((token) =>
        api.endHistory(
          token,
          patientId,
          entry.id,
          { reason, ...(note.trim() ? { note: note.trim() } : {}) },
          newIdempotencyKey()
        )
      );
      onChanged();
    } catch {
      setError(t.failed);
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-lg border px-4 py-3 ${
        ended
          ? 'border-neutral-200 bg-neutral-50 text-neutral-500'
          : entry.kind === 'allergy'
            ? 'border-red-200 bg-red-50'
            : 'border-neutral-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className={`text-lg font-medium ${ended ? 'line-through' : ''}`}>
            {entry.label}
            {entry.severity && (
              <span className="ml-2 text-sm font-normal">({t.severities[entry.severity]})</span>
            )}
          </span>
          {entry.detail && <span className="text-sm">{entry.detail}</span>}
          <span className="text-xs text-neutral-500">
            {ended
              ? t.ended
                  .replace('{date}', entry.endedAt!.slice(0, 10))
                  .replace('{reason}', t.endReasons[entry.endReason!])
              : t.noted.replace('{date}', entry.notedAt.slice(0, 10))}
            {entry.onsetDate && ` · ${t.onsetDate} ${entry.onsetDate}`}
            {ended && entry.endNote && ` · ${entry.endNote}`}
          </span>
        </div>
        {canWrite && !ended && !ending && (
          <button
            type="button"
            className="h-11 rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-white"
            onClick={() => setEnding(true)}
          >
            {t.end}
          </button>
        )}
      </div>

      {ending && (
        <form className="mt-3 flex flex-col gap-3" onSubmit={endEntry}>
          <p className="font-medium">{t.endTitle}</p>
          <label className="flex flex-col gap-1">
            <span className="text-sm">{t.endReason}</span>
            <select
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {HISTORY_END_REASONS.map((value) => (
                <option key={value} value={value}>
                  {t.endReasons[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">
              {t.endNote} ({messages.patients.optional})
            </span>
            <input
              className={inputClass}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" className={primaryButton} disabled={busy}>
              {t.confirmEnd}
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setEnding(false)}
              disabled={busy}
            >
              {messages.patients.cancel}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

function AddEntryForm({
  kind,
  patientId,
  onDone,
  onCancel,
}: {
  kind: HistoryKind;
  patientId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { authed } = useSession();
  const [label, setLabel] = useState('');
  const [detail, setDetail] = useState('');
  const [severity, setSeverity] = useState('');
  const [onsetDate, setOnsetDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { label: label.trim() };
    if (detail.trim()) body.detail = detail.trim();
    if (kind === 'allergy' && severity) body.severity = severity;
    if (onsetDate) body.onsetDate = onsetDate;
    try {
      await authed((token) => api.addHistory(token, patientId, kind, body, newIdempotencyKey()));
      onDone();
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'possible_duplicate'
          ? t.alreadyActive
          : failure instanceof ApiError && failure.code === 'validation_failed'
            ? String(
                (failure.body.issues as { message: string }[] | undefined)?.[0]?.message ?? t.failed
              )
            : t.failed
      );
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-neutral-300 p-4"
      onSubmit={submit}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t.label}</span>
        <input
          className={inputClass}
          required
          autoFocus
          placeholder={t.labelPlaceholders[kind]}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      {kind === 'allergy' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t.severity}</span>
          <select
            className={inputClass}
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          >
            <option value="">{messages.patients.choose}</option>
            {ALLERGY_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {t.severities[value]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {t.detail} ({messages.patients.optional})
        </span>
        <input
          className={inputClass}
          placeholder={t.detailPlaceholders[kind]}
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {t.onsetDate} ({messages.patients.optional})
        </span>
        <input
          className={inputClass}
          type="date"
          value={onsetDate}
          onChange={(event) => setOnsetDate(event.target.value)}
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" className={primaryButton} disabled={busy}>
          {t.save}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={busy}>
          {messages.patients.cancel}
        </button>
      </div>
    </form>
  );
}
