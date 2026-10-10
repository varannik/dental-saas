'use client';

import {
  FINDING_CODES,
  FINDINGS,
  NOTE_TYPES,
  PERIO_SITES,
  surfacesOf,
  type ChartEntry,
  type FindingCode,
  type PerioSite,
  type SessionDetail,
  type Surface,
} from '@dental/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AppFrame } from '../../../components/app-frame';
import { Elapsed } from '../../../components/elapsed';
import { PatientBanner, usePatientHeader } from '../../../components/patient-banner';
import { inputClass, primaryButton, secondaryButton } from '../../../components/patient-form';
import { RequireSession } from '../../../components/require-session';
import { SessionDiagnoses } from '../../../components/session-diagnoses';
import { describeProcedure, SessionProcedures } from '../../../components/session-procedures';
import { SessionSummary, SignedRecord, SignPanel } from '../../../components/session-signoff';
import { ToothChart } from '../../../components/tooth-chart';
import { api, ApiError, COMMAND_EVENT } from '../../../lib/api';
import { toothView } from '../../../lib/chart';
import { newIdempotencyKey } from '../../../lib/patients';
import { useSession } from '../../../lib/session';
import messages from '../../../messages/en.json';

/**
 * The examination screen (C3, screen 6): the tooth chart, findings and probing for the
 * selected tooth, procedures, notes, and completing the session. A completed session is
 * read-only and shows its summary for signing (C6); a signed one only takes amendments.
 */

const t = messages.sessions;
const codeName = (code: string) => t.codes[code as FindingCode] ?? code;

function AmendmentBadge() {
  return (
    <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 uppercase">
      {t.amendmentBadge}
    </span>
  );
}

export default function SessionPage() {
  return (
    <RequireSession>
      <Examination />
    </RequireSession>
  );
}

function Examination() {
  const { id } = useParams<{ id: string }>();
  const { authed } = useSession();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [chart, setChart] = useState<ChartEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const loaded = useRef(false);
  const header = usePatientHeader(session?.patientId ?? null);

  const reload = useCallback(async () => {
    try {
      const detail = await authed((token) => api.getSession(token, id));
      setSession(detail);
      const current = await authed((token) => api.getChart(token, detail.patientId));
      setChart(current.entries);
      loaded.current = true;
      setStale(false);
    } catch (failure) {
      // Once the session is on screen, a failed refresh keeps it there and says so.
      if (loaded.current) {
        setStale(true);
        return;
      }
      setError(
        failure instanceof ApiError && failure.status === 404
          ? messages.patients.notFound
          : failure instanceof ApiError && failure.status === 403
            ? messages.patients.noPermission
            : t.failed
      );
    }
  }, [authed, id]);

  useEffect(() => {
    void reload();
    // A command confirmed by voice changes this session too.
    const refresh = () => void reload();
    window.addEventListener(COMMAND_EVENT, refresh);
    return () => window.removeEventListener(COMMAND_EVENT, refresh);
  }, [reload]);

  if (error) {
    return (
      <AppFrame focus={{ patientId: null }}>
        <p className="text-red-700">{error}</p>
      </AppFrame>
    );
  }
  if (!session) {
    return (
      <AppFrame>
        <p className="text-neutral-500">{messages.shell.loading}</p>
      </AppFrame>
    );
  }

  const open = session.status === 'open';
  const active = session.procedures.find((p) => p.status === 'in_progress');
  const strip = open ? (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>
        <span className="font-semibold">
          {t.strip.replace(
            '{time}',
            new Date(session.startedAt).toLocaleTimeString('en-GB', { timeStyle: 'short' })
          )}
        </span>{' '}
        (<Elapsed since={session.startedAt} />)
        {session.chiefComplaint && ` · ${session.chiefComplaint}`}
      </span>
      {active && (
        <span className="rounded-full bg-sky-600 px-3 py-0.5 font-semibold text-white">
          {t.activeProcedure.replace(
            '{name}',
            `${active.procedureType.name} ${describeProcedure(active)}`.trim()
          )}{' '}
          · <Elapsed since={active.startedAt} />
        </span>
      )}
      {selected && (
        <span className="font-semibold">{t.activeTooth.replace('{tooth}', selected)}</span>
      )}
    </span>
  ) : (
    t.stripClosed
      .replace('{status}', t.statuses[session.status].toLowerCase())
      .replace('{date}', new Date(session.startedAt).toLocaleDateString('en-GB'))
  );

  return (
    <AppFrame
      focus={{
        patientId: session.patientId,
        sessionId: session.id,
        procedureId: active?.id ?? null,
        tooth: selected,
      }}
      patientBanner={
        header.patient ? (
          <PatientBanner patient={header.patient} allergies={header.allergies} />
        ) : undefined
      }
      sessionStrip={strip}
      sessionOpen={open}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/patients/${session.patientId}`}
            className="text-neutral-600 hover:text-neutral-900"
          >
            ← {t.backToPatient}
          </Link>
          {open && session.procedures.some((p) => p.status === 'in_progress') && (
            <span className="ml-auto text-sm text-neutral-600">{t.completeBlocked}</span>
          )}
          {open && (
            <CompleteButton
              sessionId={session.id}
              blocked={session.procedures.some((p) => p.status === 'in_progress')}
              onDone={reload}
            />
          )}
        </div>

        {stale && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-amber-900"
          >
            {t.stale}
            <button type="button" className={secondaryButton} onClick={() => void reload()}>
              {t.refresh}
            </button>
          </div>
        )}
        {session.status === 'completed' && (
          <p className="rounded-lg bg-neutral-100 px-4 py-3 text-neutral-700">
            {t.readOnly.replace('{status}', t.statuses[session.status].toLowerCase())}
          </p>
        )}
        {!open && <SessionSummary session={session} />}
        {session.status === 'completed' && <SignPanel session={session} onChanged={reload} />}
        {session.status === 'signed' && <SignedRecord session={session} onChanged={reload} />}

        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-1 text-xl font-semibold">{t.chart}</h2>
          <p className="mb-4 text-sm text-neutral-500">{t.chartHint}</p>
          <ToothChart entries={chart} selected={selected} onSelect={setSelected} />
        </section>

        {selected && (
          <div className="grid gap-6 lg:grid-cols-2">
            <ToothPanel
              tooth={selected}
              session={session}
              chart={chart}
              editable={open}
              onChanged={reload}
            />
            <PerioPanel tooth={selected} session={session} editable={open} onChanged={reload} />
          </div>
        )}

        <SessionDiagnoses
          sessionId={session.id}
          diagnoses={session.diagnoses}
          selectedTooth={selected}
          editable={open}
          onChanged={reload}
        />

        {(open || session.procedures.length > 0) && (
          <SessionProcedures
            sessionId={session.id}
            patientId={session.patientId}
            procedures={session.procedures}
            editable={open}
            onChanged={reload}
          />
        )}

        <NotesPanel session={session} editable={open} onChanged={reload} />
      </div>
    </AppFrame>
  );
}

function ToothPanel({
  tooth,
  session,
  chart,
  editable,
  onChanged,
}: {
  tooth: string;
  session: SessionDetail;
  chart: ChartEntry[];
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const { authed } = useSession();
  const [code, setCode] = useState<FindingCode>('caries');
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = toothView(chart, tooth);
  const scope = FINDINGS[code].scope;
  const findings = session.findings.filter((finding) => finding.tooth === tooth);

  useEffect(() => {
    setSurfaces([]);
    setError(null);
  }, [tooth]);

  async function record(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { tooth, code };
    if (scope !== 'tooth' && surfaces.length > 0) body.surfaces = surfaces;
    if (value.trim()) body.value = value.trim();
    if (note.trim()) body.note = note.trim();
    try {
      await authed((token) => api.addFinding(token, session.id, body, newIdempotencyKey()));
      setSurfaces([]);
      setValue('');
      setNote('');
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

  const states = [
    ...(view.tooth ? [codeName(view.tooth)] : []),
    ...Object.entries(view.surfaces).map(
      ([surface, state]) => `${codeName(state)} · ${t.surfaceNames[surface as Surface]}`
    ),
  ];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-xl font-semibold">{t.tooth.replace('{tooth}', tooth)}</h2>
      <div>
        <h3 className="text-sm font-medium text-neutral-500">{t.currentState}</h3>
        <p className="text-lg">{states.length ? states.join(', ') : t.nothingRecorded}</p>
      </div>

      {editable && (
        <form
          className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4"
          onSubmit={record}
        >
          <h3 className="font-semibold">{t.addFinding}</h3>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t.finding}</span>
            <select
              className={inputClass}
              value={code}
              onChange={(event) => {
                setCode(event.target.value as FindingCode);
                setSurfaces([]);
              }}
            >
              {FINDING_CODES.map((option) => (
                <option key={option} value={option}>
                  {codeName(option)}
                </option>
              ))}
            </select>
          </label>
          {scope !== 'tooth' && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">
                {t.surfaces}
                {scope === 'either' && (
                  <span className="ml-1 font-normal text-neutral-500">
                    ({t.wholeTooth} if none)
                  </span>
                )}
              </legend>
              <div className="flex flex-wrap gap-2">
                {surfacesOf(tooth).map((surface) => {
                  const checked = surfaces.includes(surface);
                  return (
                    <label
                      key={surface}
                      className={`flex h-12 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-3 font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-600 ${
                        checked
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300'
                      }`}
                      title={t.surfaceNames[surface]}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        aria-label={t.surfaceNames[surface]}
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
              {t.value} ({messages.patients.optional})
            </span>
            <input
              className={inputClass}
              placeholder={t.valueHint}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
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
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? t.recording : t.record}
          </button>
        </form>
      )}

      <div>
        <h3 className="mb-2 font-semibold">{t.findingsInSession}</h3>
        {findings.length === 0 ? (
          <p className="text-neutral-500">{t.noFindings}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {findings.map((finding) => (
              <li key={finding.id} className="text-sm">
                <span className="font-medium">{codeName(finding.code)}</span>
                {finding.amendmentId && <AmendmentBadge />}
                {finding.surface && ` · ${t.surfaceNames[finding.surface]}`}
                {finding.value && ` · ${finding.value}`}
                {finding.note && <span className="text-neutral-500"> · {finding.note}</span>}
                <span className="text-neutral-400">
                  {' '}
                  ·{' '}
                  {new Date(finding.recordedAt).toLocaleTimeString('en-GB', { timeStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PerioPanel({
  tooth,
  session,
  editable,
  onChanged,
}: {
  tooth: string;
  session: SessionDetail;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const { authed } = useSession();
  const recorded = session.perio.filter((m) => m.tooth === tooth);
  const initial = () =>
    Object.fromEntries(
      PERIO_SITES.map((site) => {
        const m = recorded.find((r) => r.site === site);
        return [site, { depth: m ? String(m.pocketDepth) : '', bleeding: m?.bleeding ?? false }];
      })
    ) as Record<PerioSite, { depth: string; bleeding: boolean }>;
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setValues(initial());
    setStatus(null);
    // Reset when the tooth or the recorded readings change.
  }, [tooth, session.perio]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const measurements = PERIO_SITES.filter((site) => values[site].depth !== '').map((site) => ({
      tooth,
      site,
      pocketDepth: Number(values[site].depth),
      bleeding: values[site].bleeding,
    }));
    if (measurements.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      await authed((token) =>
        api.recordPerio(token, session.id, { measurements }, newIdempotencyKey())
      );
      await onChanged();
      setStatus(t.perioSaved);
    } catch {
      setStatus(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
      <div>
        <h2 className="text-xl font-semibold">{t.perio}</h2>
        <p className="text-sm text-neutral-500">{t.perioHint}</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={save}>
        <div className="grid grid-cols-3 gap-3">
          {PERIO_SITES.map((site) => (
            <div key={site} className="flex flex-col gap-1">
              <label className="text-sm font-medium" title={t.sites[site]}>
                {site}
                <input
                  className={`${inputClass} mt-1 text-center`}
                  inputMode="numeric"
                  pattern="\d{1,2}"
                  aria-label={`${t.sites[site]} mm`}
                  disabled={!editable}
                  value={values[site].depth}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      [site]: {
                        ...values[site],
                        depth: event.target.value.replace(/\D/g, '').slice(0, 2),
                      },
                    })
                  }
                />
              </label>
              <label className="flex min-h-8 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  disabled={!editable}
                  checked={values[site].bleeding}
                  aria-label={`${t.sites[site]} ${t.bleeding}`}
                  onChange={(event) =>
                    setValues({
                      ...values,
                      [site]: { ...values[site], bleeding: event.target.checked },
                    })
                  }
                />
                {t.bleeding}
              </label>
            </div>
          ))}
        </div>
        {editable && (
          <div className="flex items-center gap-3">
            <button type="submit" className={secondaryButton} disabled={busy}>
              {t.savePerio}
            </button>
            {status && <span className="text-sm text-neutral-600">{status}</span>}
          </div>
        )}
      </form>
    </section>
  );
}

function NotesPanel({
  session,
  editable,
  onChanged,
}: {
  session: SessionDetail;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const { authed } = useSession();
  const [body, setBody] = useState('');
  const [type, setType] = useState<string>('clinical');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await authed((token) =>
        api.addNote(token, session.id, { type, body: body.trim() }, newIdempotencyKey())
      );
      setBody('');
      await onChanged();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="text-xl font-semibold">{t.notes}</h2>
      {session.notes.length === 0 ? (
        <p className="text-neutral-500">{t.noNotes}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {session.notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-neutral-50 px-4 py-3">
              <p className="whitespace-pre-wrap">{note.body}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {note.type} ·{' '}
                {new Date(note.recordedAt).toLocaleTimeString('en-GB', { timeStyle: 'short' })}
                {note.amendmentId && <AmendmentBadge />}
              </p>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form className="flex flex-col gap-3" onSubmit={add}>
          <textarea
            className={`${inputClass} h-28 py-2`}
            aria-label={t.addNote}
            placeholder={t.notePlaceholder}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <select
              className={`${inputClass} w-auto`}
              aria-label="Note type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {NOTE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button type="submit" className={secondaryButton} disabled={busy || !body.trim()}>
              {t.addNote}
            </button>
            {error && <span className="text-sm text-red-700">{error}</span>}
          </div>
        </form>
      )}
    </section>
  );
}

function CompleteButton({
  sessionId,
  blocked,
  onDone,
}: {
  sessionId: string;
  blocked: boolean;
  onDone: () => Promise<void>;
}) {
  const { authed } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={primaryButton}
      disabled={busy || blocked}
      onClick={async () => {
        if (!window.confirm(t.completeConfirm)) return;
        setBusy(true);
        try {
          await authed((token) => api.completeSession(token, sessionId, newIdempotencyKey()));
          await onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      {t.complete}
    </button>
  );
}
