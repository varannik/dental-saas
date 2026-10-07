'use client';

import {
  DIAGNOSIS_CERTAINTY,
  DIAGNOSIS_CODES,
  isValidFdi,
  type Diagnosis,
  type DiagnosisCode,
} from '@dental/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { newIdempotencyKey } from '../lib/patients';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';
import { inputClass, primaryButton, secondaryButton } from './patient-form';

/**
 * The session's diagnoses (C4, screen 7). Suggested diagnoses have a dashed outline and
 * confirmed ones a solid border, so the two never look alike (spec section K). Assistants
 * suggest; dentists record, confirm, reject and retract.
 */

const t = messages.diagnoses;

export function SessionDiagnoses({
  sessionId,
  diagnoses,
  selectedTooth,
  editable,
  onChanged,
}: {
  sessionId: string;
  diagnoses: Diagnosis[];
  selectedTooth: string | null;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const { state } = useSession();
  const permissions = state.status === 'signed_in' ? state.session.permissions : [];
  const canDecide = permissions.includes('diagnosis.write');
  const canSuggest = permissions.includes('diagnosis.suggest') || canDecide;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-xl font-semibold">{t.title}</h2>
      {diagnoses.length === 0 ? (
        <p className="text-neutral-500">{t.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {diagnoses.map((diagnosis) => (
            <DiagnosisItem
              key={diagnosis.id}
              diagnosis={diagnosis}
              canDecide={canDecide && editable}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      {editable && canSuggest && (
        <AddDiagnosis
          sessionId={sessionId}
          selectedTooth={selectedTooth}
          canConfirm={canDecide}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}

function label(diagnosis: Diagnosis) {
  const name = t.codes[diagnosis.code] ?? diagnosis.code;
  return diagnosis.code === 'other' && diagnosis.label ? diagnosis.label : name;
}

function DiagnosisItem({
  diagnosis,
  canDecide,
  onChanged,
}: {
  diagnosis: Diagnosis;
  canDecide: boolean;
  onChanged: () => Promise<void>;
}) {
  const { authed } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inactive = diagnosis.status === 'rejected' || diagnosis.status === 'retracted';

  async function decide(status: 'confirmed' | 'rejected' | 'retracted') {
    let reason: string | undefined;
    if (status === 'retracted') {
      const answer = window.prompt(t.retractReason);
      if (!answer?.trim()) return;
      reason = answer.trim();
    } else if (status === 'rejected') {
      reason = window.prompt(t.rejectReason)?.trim() || undefined;
    }
    setBusy(true);
    setError(null);
    try {
      await authed((token) =>
        api.decideDiagnosis(
          token,
          diagnosis.id,
          { status, ...(reason ? { reason } : {}) },
          newIdempotencyKey()
        )
      );
      await onChanged();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 ${
        diagnosis.status === 'suggested'
          ? 'border-2 border-dashed border-amber-500 bg-amber-50'
          : diagnosis.status === 'confirmed'
            ? 'border-2 border-solid border-neutral-900'
            : 'border border-neutral-200 bg-neutral-50 text-neutral-500'
      }`}
    >
      <div className="flex flex-col">
        <span className={`text-lg font-medium ${inactive ? 'line-through' : ''}`}>
          {label(diagnosis)}
          <span className="ml-2 text-base font-normal text-neutral-600">
            {diagnosis.tooth ? `${t.tooth} ${diagnosis.tooth}` : t.wholeMouth}
          </span>
        </span>
        <span className="text-sm">
          <span
            className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
              diagnosis.status === 'suggested'
                ? 'bg-amber-200 text-amber-900'
                : diagnosis.status === 'confirmed'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-200 text-neutral-700'
            }`}
          >
            {t.statuses[diagnosis.status]}
          </span>
          {diagnosis.certainty && t.certainties[diagnosis.certainty]}
          {diagnosis.reason && <span className="text-neutral-500"> · {diagnosis.reason}</span>}
        </span>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
      {canDecide && (
        <div className="flex flex-wrap gap-2">
          {diagnosis.status === 'suggested' && (
            <>
              <button
                type="button"
                className={primaryButton}
                disabled={busy}
                onClick={() => void decide('confirmed')}
              >
                {t.confirm}
              </button>
              <button
                type="button"
                className={secondaryButton}
                disabled={busy}
                onClick={() => void decide('rejected')}
              >
                {t.reject}
              </button>
            </>
          )}
          {diagnosis.status === 'confirmed' && (
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => void decide('retracted')}
            >
              {t.retract}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function AddDiagnosis({
  sessionId,
  selectedTooth,
  canConfirm,
  onChanged,
}: {
  sessionId: string;
  selectedTooth: string | null;
  canConfirm: boolean;
  onChanged: () => Promise<void>;
}) {
  const { authed } = useSession();
  const [code, setCode] = useState<DiagnosisCode>('caries_dentine');
  const [tooth, setTooth] = useState(selectedTooth ?? '');
  const [description, setDescription] = useState('');
  const [certainty, setCertainty] = useState('');
  const [confirmed, setConfirmed] = useState(canConfirm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the tooth selected on the chart.
  useEffect(() => {
    if (selectedTooth) setTooth(selectedTooth);
  }, [selectedTooth]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      code,
      status: canConfirm && confirmed ? 'confirmed' : 'suggested',
    };
    if (tooth.trim()) body.tooth = tooth.trim();
    if (description.trim()) body.label = description.trim();
    if (certainty) body.certainty = certainty;
    try {
      await authed((token) => api.addDiagnosis(token, sessionId, body, newIdempotencyKey()));
      setDescription('');
      setCertainty('');
      await onChanged();
    } catch (failure) {
      const issue =
        failure instanceof ApiError && failure.code === 'validation_failed'
          ? (failure.body.issues as { message: string }[] | undefined)?.[0]?.message
          : undefined;
      setError(issue ?? t.failed);
    } finally {
      setBusy(false);
    }
  }

  const toothValid = tooth.trim() === '' || isValidFdi(tooth.trim());

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4"
      onSubmit={submit}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">{t.diagnosis}</span>
          <select
            className={inputClass}
            value={code}
            onChange={(event) => setCode(event.target.value as DiagnosisCode)}
          >
            {DIAGNOSIS_CODES.map((option) => (
              <option key={option} value={option}>
                {t.codes[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            {t.tooth}{' '}
            <span className="font-normal text-neutral-500">({t.wholeMouth} if empty)</span>
          </span>
          <input
            className={inputClass}
            inputMode="numeric"
            maxLength={2}
            aria-invalid={!toothValid || undefined}
            value={tooth}
            onChange={(event) => setTooth(event.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">
            {t.description}{' '}
            <span className="font-normal text-neutral-500">({t.descriptionHint})</span>
          </span>
          <input
            className={inputClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t.certainty}</span>
          <select
            className={inputClass}
            value={certainty}
            onChange={(event) => setCertainty(event.target.value)}
          >
            <option value="">{messages.patients.choose}</option>
            {DIAGNOSIS_CERTAINTY.map((option) => (
              <option key={option} value={option}>
                {t.certainties[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {canConfirm ? (
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          {t.asConfirmed}
        </label>
      ) : (
        <p className="text-sm text-neutral-500">{t.assistantHint}</p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" className={primaryButton} disabled={busy || !toothValid}>
        {canConfirm && confirmed ? t.record : t.suggest}
      </button>
    </form>
  );
}
