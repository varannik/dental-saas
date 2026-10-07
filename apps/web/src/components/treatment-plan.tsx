'use client';

import {
  PROCEDURE_CATEGORIES,
  surfacesOf,
  isValidFdi,
  type PlanItem,
  type ProcedureType,
  type Surface,
  type TreatmentPlan,
} from '@dental/contracts';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { newIdempotencyKey } from '../lib/patients';
import { moveItem } from '../lib/plans';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';
import { inputClass, primaryButton, secondaryButton } from './patient-form';

/**
 * The patient's open treatment plan (C5, screen 8): ordered items with up and down buttons,
 * adding at the end or after an item, cancelling items, and accepting or cancelling the plan.
 */

const t = messages.plans;

export function TreatmentPlanCard({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const { authed } = useSession();
  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null);
  const [procedures, setProcedures] = useState<ProcedureType[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const result = await authed((token) => api.listPlans(token, patientId));
    setPlans(result.plans);
  }, [authed, patientId]);

  useEffect(() => {
    void reload().catch(() => setPlans([]));
    void authed((token) => api.procedureTypes(token))
      .then((result) => setProcedures(result.procedureTypes))
      .catch(() => undefined);
  }, [authed, reload]);

  const open = plans?.find((plan) => plan.status === 'proposed' || plan.status === 'accepted');
  const past = plans?.filter((plan) => plan !== open) ?? [];

  /** Runs a plan change; on a version conflict the plan reloads with a notice. */
  async function act(change: (token: string) => Promise<TreatmentPlan>) {
    setBusy(true);
    setNotice(null);
    try {
      await authed(change);
      await reload();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'version_conflict') {
        await reload();
        setNotice(t.conflict);
      } else {
        const issue =
          failure instanceof ApiError
            ? ((failure.body.issues as { message: string }[] | undefined)?.[0]?.message ??
              (failure.status < 500 ? failure.message : undefined))
            : undefined;
        setNotice(issue ?? t.failed);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {t.title}
          {open?.title && <span className="ml-2 font-normal text-neutral-600">· {open.title}</span>}
        </h2>
        {open && (
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              open.status === 'accepted'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-sky-100 text-sky-800'
            }`}
          >
            {t.statuses[open.status]}
          </span>
        )}
      </div>

      {notice && (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">
          {notice}
        </p>
      )}

      {plans && !open && (
        <>
          <p className="text-neutral-500">{t.none}</p>
          {canEdit && <CreatePlan patientId={patientId} busy={busy} act={act} />}
        </>
      )}

      {open && (
        <>
          <PlanItems plan={open} canEdit={canEdit} busy={busy} act={act} />
          {canEdit && <AddItem plan={open} procedures={procedures} busy={busy} act={act} />}
          {canEdit && (
            <div className="flex flex-wrap gap-3">
              {open.status === 'proposed' && (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy}
                  onClick={() =>
                    void act((token) =>
                      api.planAction(token, open.id, 'accept', {}, newIdempotencyKey())
                    )
                  }
                >
                  {t.accept}
                </button>
              )}
              <button
                type="button"
                className={secondaryButton}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t.cancelPlanConfirm)) return;
                  void act((token) =>
                    api.planAction(token, open.id, 'cancel', {}, newIdempotencyKey())
                  );
                }}
              >
                {t.cancelPlan}
              </button>
            </div>
          )}
        </>
      )}

      {past.length > 0 && (
        <details className="text-sm text-neutral-600">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">{t.past}</summary>
          <ul className="flex flex-col gap-1">
            {past.map((plan) => (
              <li key={plan.id}>
                {new Date(plan.createdAt).toLocaleDateString('en-GB')} · {plan.title ?? t.title} ·{' '}
                {t.statuses[plan.status]} · {t.items.replace('{count}', String(plan.items.length))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

type Act = (change: (token: string) => Promise<TreatmentPlan>) => Promise<void>;

function describe(item: Pick<PlanItem, 'tooth' | 'surfaces'>) {
  if (!item.tooth) return '';
  return item.surfaces.length ? `${item.tooth} ${item.surfaces.join('')}` : item.tooth;
}

function PlanItems({
  plan,
  canEdit,
  busy,
  act,
}: {
  plan: TreatmentPlan;
  canEdit: boolean;
  busy: boolean;
  act: Act;
}) {
  if (plan.items.length === 0) return <p className="text-neutral-500">{t.empty}</p>;
  const ids = plan.items.map((item) => item.id);
  const move = (id: string, direction: -1 | 1) =>
    act((token) =>
      api.planAction(
        token,
        plan.id,
        'reorder',
        { version: plan.version, itemIds: moveItem(ids, id, direction) },
        newIdempotencyKey()
      )
    );

  return (
    <ol className="flex flex-col gap-2">
      {plan.items.map((item, index) => {
        const cancelled = item.status === 'cancelled';
        return (
          <li
            key={item.id}
            className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
              cancelled ? 'border-neutral-200 bg-neutral-50 text-neutral-500' : 'border-neutral-300'
            }`}
          >
            <span className="w-8 text-center text-lg font-semibold tabular-nums">
              {item.sequence}.
            </span>
            <span className="flex min-w-48 flex-1 flex-col">
              <span className={`text-lg font-medium ${cancelled ? 'line-through' : ''}`}>
                {item.procedureType.name}
                {item.tooth && (
                  <span className="ml-2 font-normal text-neutral-600">
                    {t.tooth} {describe(item)}
                  </span>
                )}
              </span>
              {(item.note || item.cancelReason) && (
                <span className="text-sm text-neutral-500">{item.cancelReason ?? item.note}</span>
              )}
            </span>
            {item.status !== 'planned' && (
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold uppercase">
                {t.itemStatuses[item.status]}
              </span>
            )}
            {canEdit && (
              <span className="flex gap-1">
                <button
                  type="button"
                  className="size-11 rounded-lg border border-neutral-300 text-lg hover:bg-neutral-50 disabled:opacity-30"
                  aria-label={`${t.moveUp}: ${item.procedureType.name}`}
                  disabled={busy || index === 0}
                  onClick={() => void move(item.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="size-11 rounded-lg border border-neutral-300 text-lg hover:bg-neutral-50 disabled:opacity-30"
                  aria-label={`${t.moveDown}: ${item.procedureType.name}`}
                  disabled={busy || index === plan.items.length - 1}
                  onClick={() => void move(item.id, 1)}
                >
                  ↓
                </button>
                {item.status === 'planned' && (
                  <button
                    type="button"
                    className="h-11 rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt(t.cancelItemReason);
                      if (reason === null) return;
                      void act((token) =>
                        api.planAction(
                          token,
                          plan.id,
                          `items/${item.id}/cancel`,
                          reason.trim() ? { reason: reason.trim() } : {},
                          newIdempotencyKey()
                        )
                      );
                    }}
                  >
                    {t.cancelItem}
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AddItem({
  plan,
  procedures,
  busy,
  act,
}: {
  plan: TreatmentPlan;
  procedures: ProcedureType[];
  busy: boolean;
  act: Act;
}) {
  const [code, setCode] = useState('');
  const [tooth, setTooth] = useState('');
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [after, setAfter] = useState('');
  const [note, setNote] = useState('');
  const procedure = procedures.find((p) => p.code === code);
  const grouped = useMemo(
    () =>
      PROCEDURE_CATEGORIES.map((category) => ({
        category,
        items: procedures.filter((p) => p.category === category),
      })).filter((group) => group.items.length > 0),
    [procedures]
  );
  const toothOk = isValidFdi(tooth);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!procedure) return;
    const body: Record<string, unknown> = { procedureCode: procedure.code };
    if (procedure.scope !== 'mouth') body.tooth = tooth;
    if (procedure.scope === 'surfaces') body.surfaces = surfaces;
    if (after) body.afterItemId = after;
    if (note.trim()) body.note = note.trim();
    await act((token) => api.planAction(token, plan.id, 'items', body, newIdempotencyKey()));
    setSurfaces([]);
    setNote('');
    setAfter('');
  }

  const ready =
    procedure &&
    (procedure.scope === 'mouth' || toothOk) &&
    (procedure.scope !== 'surfaces' || surfaces.length > 0);

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4"
      onSubmit={submit}
    >
      <h3 className="font-semibold">{t.addItem}</h3>
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
              <optgroup key={group.category} label={t.categories[group.category]}>
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
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t.position}</span>
          <select
            className={inputClass}
            value={after}
            onChange={(event) => setAfter(event.target.value)}
          >
            <option value="">{t.atEnd}</option>
            {plan.items.map((item) => (
              <option key={item.id} value={item.id}>
                {t.after
                  .replace('{n}', String(item.sequence))
                  .replace('{name}', `${item.procedureType.name} ${describe(item)}`.trim())}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">
            {t.note} ({messages.patients.optional})
          </span>
          <input
            className={inputClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <button type="submit" className={primaryButton} disabled={busy || !ready}>
        {t.addItem}
      </button>
    </form>
  );
}

function CreatePlan({ patientId, busy, act }: { patientId: string; busy: boolean; act: Act }) {
  const [title, setTitle] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void act((token) =>
          api.createPlan(
            token,
            patientId,
            title.trim() ? { title: title.trim() } : {},
            newIdempotencyKey()
          )
        );
      }}
    >
      <label className="flex min-w-64 flex-1 flex-col gap-1.5">
        <span className="font-medium">
          {t.planTitle} ({messages.patients.optional})
        </span>
        <input
          className={inputClass}
          placeholder={t.planTitlePlaceholder}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <button type="submit" className={primaryButton} disabled={busy}>
        {t.create}
      </button>
    </form>
  );
}
