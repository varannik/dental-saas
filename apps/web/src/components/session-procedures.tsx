'use client';

import {
  PROCEDURE_CATEGORIES,
  isValidFdi,
  surfacesOf,
  type PlanItem,
  type Procedure,
  type ProcedureType,
  type Surface,
} from '@dental/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { newIdempotencyKey } from '../lib/patients';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';
import { Elapsed } from './elapsed';
import { inputClass, primaryButton, secondaryButton } from './patient-form';

/**
 * Procedures in a session (C6, screen 8). A dentist starts one from the patient's treatment
 * plan or ad hoc, then completes or cancels it. Completing updates the plan and the chart.
 */

const t = messages.procedures;

export function describeProcedure(item: Pick<Procedure, 'tooth' | 'surfaces'>) {
  if (!item.tooth) return '';
  return item.surfaces.length ? `${item.tooth} ${item.surfaces.join('')}` : item.tooth;
}

function errorText(failure: unknown) {
  if (failure instanceof ApiError) {
    const issue = (failure.body.issues as { message: string }[] | undefined)?.[0]?.message;
    if (issue) return issue;
    if (failure.status === 409 || failure.status === 422) return failure.message;
  }
  return t.failed;
}

export function SessionProcedures({
  sessionId,
  patientId,
  procedures,
  editable,
  onChanged,
}: {
  sessionId: string;
  patientId: string;
  procedures: Procedure[];
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const { state, authed } = useSession();
  const permissions = state.status === 'signed_in' ? state.session.permissions : [];
  const canPerform = permissions.includes('procedure.write');
  const [planned, setPlanned] = useState<PlanItem[]>([]);
  const [catalog, setCatalog] = useState<ProcedureType[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = editable && canPerform;

  useEffect(() => {
    if (!active) return;
    void authed((token) => api.listPlans(token, patientId))
      .then(({ plans }) => {
        const open = plans.find((p) => p.status === 'proposed' || p.status === 'accepted');
        setPlanned(open ? open.items.filter((item) => item.status === 'planned') : []);
      })
      .catch(() => setPlanned([]));
  }, [active, authed, patientId, procedures]);

  useEffect(() => {
    if (!active) return;
    void authed((token) => api.procedureTypes(token))
      .then((result) => setCatalog(result.procedureTypes))
      .catch(() => setCatalog([]));
  }, [active, authed]);

  async function run(change: (token: string) => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await authed(change);
      await onChanged();
      return true;
    } catch (failure) {
      setError(errorText(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // An item already being performed in this session is not offered again.
  const inProgress = new Set(
    procedures.filter((p) => p.status === 'in_progress').map((p) => p.planItemId)
  );
  const waiting = planned.filter((item) => !inProgress.has(item.id));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-xl font-semibold">{t.title}</h2>
      {procedures.length === 0 ? (
        <p className="text-neutral-500">{t.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {procedures.map((procedure) => (
            <ProcedureItem
              key={procedure.id}
              procedure={procedure}
              actions={active && procedure.status === 'in_progress'}
              busy={busy}
              run={run}
            />
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {editable && !canPerform && <p className="text-sm text-neutral-500">{t.dentistOnly}</p>}

      {active && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{t.fromPlan}</h3>
          {waiting.length === 0 ? (
            <p className="text-sm text-neutral-500">{t.noPlanned}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {waiting.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 px-4 py-3"
                >
                  <span>
                    <span className="font-medium">
                      {item.sequence}. {item.procedureType.name}
                    </span>
                    <span className="ml-2 text-neutral-600">{describeProcedure(item)}</span>
                    {item.note && <span className="text-sm text-neutral-500"> · {item.note}</span>}
                  </span>
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={busy}
                    aria-label={`${t.start} ${item.procedureType.name} ${describeProcedure(item)}`.trim()}
                    onClick={() =>
                      void run((token) =>
                        api.startProcedure(
                          token,
                          sessionId,
                          { planItemId: item.id },
                          newIdempotencyKey()
                        )
                      )
                    }
                  >
                    {t.start}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {active && (
        <AdHoc
          catalog={catalog}
          busy={busy}
          start={(body) =>
            run((token) => api.startProcedure(token, sessionId, body, newIdempotencyKey()))
          }
        />
      )}
    </section>
  );
}

function ProcedureItem({
  procedure,
  actions,
  busy,
  run,
}: {
  procedure: Procedure;
  actions: boolean;
  busy: boolean;
  run: (change: (token: string) => Promise<unknown>) => Promise<boolean>;
}) {
  const name = `${procedure.procedureType.name} ${describeProcedure(procedure)}`.trim();
  const finish = (status: 'completed' | 'cancelled') => {
    let reason: string | undefined;
    if (status === 'completed') {
      if (!window.confirm(t.completeConfirm.replace('{name}', name))) return;
    } else {
      const answer = window.prompt(t.cancelReason);
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    void run((token) =>
      api.finishProcedure(
        token,
        procedure.id,
        { status, ...(reason ? { reason } : {}) },
        newIdempotencyKey()
      )
    );
  };

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 ${
        procedure.status === 'in_progress'
          ? 'border-2 border-sky-600 bg-sky-50'
          : procedure.status === 'completed'
            ? 'border border-neutral-300'
            : 'border border-neutral-200 bg-neutral-50 text-neutral-500'
      }`}
    >
      <div className="flex flex-col">
        <span
          className={`text-lg font-medium ${procedure.status === 'cancelled' ? 'line-through' : ''}`}
        >
          {procedure.procedureType.name}
          <span className="ml-2 text-base font-normal text-neutral-600">
            {describeProcedure(procedure)}
          </span>
        </span>
        <span className="text-sm">
          <span
            className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
              procedure.status === 'in_progress'
                ? 'bg-sky-600 text-white'
                : procedure.status === 'completed'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-200 text-neutral-700'
            }`}
          >
            {t.statuses[procedure.status]}
          </span>
          {procedure.status === 'in_progress' && (
            <span className="mr-2 font-semibold text-sky-800">
              <Elapsed since={procedure.startedAt} />
            </span>
          )}
          {procedure.planItemId && <span className="text-neutral-600">{t.planned}</span>}
          {procedure.cancelReason && (
            <span className="text-neutral-500"> · {procedure.cancelReason}</span>
          )}
          {procedure.note && <span className="text-neutral-500"> · {procedure.note}</span>}
        </span>
      </div>
      {actions && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButton}
            disabled={busy}
            aria-label={`${t.complete} ${name}`}
            onClick={() => finish('completed')}
          >
            {t.complete}
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            aria-label={`${t.cancel} ${name}`}
            onClick={() => finish('cancelled')}
          >
            {t.cancel}
          </button>
        </div>
      )}
    </li>
  );
}

function AdHoc({
  catalog,
  busy,
  start,
}: {
  catalog: ProcedureType[];
  busy: boolean;
  start: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [code, setCode] = useState('');
  const [tooth, setTooth] = useState('');
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [note, setNote] = useState('');
  const procedure = catalog.find((p) => p.code === code);
  const grouped = useMemo(
    () =>
      PROCEDURE_CATEGORIES.map((category) => ({
        category,
        items: catalog.filter((p) => p.category === category),
      })).filter((group) => group.items.length > 0),
    [catalog]
  );
  const toothOk = isValidFdi(tooth);
  const ready =
    procedure &&
    (procedure.scope === 'mouth' || toothOk) &&
    (procedure.scope !== 'surfaces' || surfaces.length > 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!procedure) return;
    const body: Record<string, unknown> = { procedureCode: procedure.code };
    if (procedure.scope !== 'mouth') body.tooth = tooth;
    if (procedure.scope === 'surfaces') body.surfaces = surfaces;
    if (note.trim()) body.note = note.trim();
    if (await start(body)) {
      setCode('');
      setTooth('');
      setSurfaces([]);
      setNote('');
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4"
      onSubmit={submit}
    >
      <h3 className="font-semibold">{t.adHoc}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">{t.procedure}</span>
          <select
            className={inputClass}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setSurfaces([]);
            }}
          >
            <option value="" disabled>
              {messages.patients.choose}
            </option>
            {grouped.map((group) => (
              <optgroup key={group.category} label={messages.plans.categories[group.category]}>
                {group.items.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {procedure && procedure.scope !== 'mouth' && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t.tooth}</span>
            <input
              className={inputClass}
              inputMode="numeric"
              maxLength={2}
              value={tooth}
              aria-invalid={(tooth !== '' && !toothOk) || undefined}
              onChange={(event) => {
                setTooth(event.target.value.replace(/\D/g, ''));
                setSurfaces([]);
              }}
            />
          </label>
        )}
      </div>
      {procedure?.scope === 'surfaces' && toothOk && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">{t.surfaces}</legend>
          <div className="flex flex-wrap gap-2">
            {surfacesOf(tooth).map((surface) => {
              const checked = surfaces.includes(surface);
              return (
                <label
                  key={surface}
                  title={messages.sessions.surfaceNames[surface]}
                  className={`flex h-12 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-3 font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-600 ${
                    checked ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    aria-label={messages.sessions.surfaceNames[surface]}
                    onChange={() =>
                      setSurfaces(
                        checked ? surfaces.filter((s) => s !== surface) : [...surfaces, surface]
                      )
                    }
                  />
                  {surface}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {t.note} ({messages.patients.optional})
        </span>
        <input
          className={inputClass}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <button type="submit" className={primaryButton} disabled={busy || !ready}>
        {t.startAdHoc}
      </button>
    </form>
  );
}
