'use client';

import {
  VOICE_COMMANDS,
  type CommandType,
  type PendingProposal,
  type VoiceInterpretation,
} from '@dental/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { useVoice } from '../lib/voice/voice-provider';
import type { VoiceConnection } from '../lib/voice/voice-socket';
import messages from '../messages/en.json';

/**
 * The voice bar (spec section K): connection and microphone state, push to talk, the input
 * level, and the transcript: live while talking, then final (V2). Transcripts become proposed
 * commands from V4 on.
 */

const t = messages.voice;

const DOT: Record<VoiceConnection, string> = {
  idle: 'bg-neutral-400',
  connecting: 'bg-amber-400',
  open: 'bg-emerald-500',
  reconnecting: 'bg-amber-500 animate-pulse',
  offline: 'bg-red-600',
  unavailable: 'bg-neutral-300',
};

const commandName = (command: string) => t.commands[command as keyof typeof t.commands] ?? command;
const entityName = (entity: string) => t.entities[entity as keyof typeof t.entities] ?? entity;

const fieldName = (key: string) => t.fields[key as keyof typeof t.fields] ?? key;

/**
 * What the utterance was understood as: the resolved fields (V5), each marked when it was taken
 * from the screen rather than said, then what is still needed or stands in the way.
 */
function Understood({ interpretation }: { interpretation: VoiceInterpretation }) {
  // A yes, no, correction or undo is answered by the outcome line instead.
  if (interpretation.outcome === 'control') return null;
  if (interpretation.outcome !== 'intent' || !interpretation.command) {
    const text =
      interpretation.outcome === 'none'
        ? t.notACommand
        : interpretation.outcome === 'rejected'
          ? t.rejected
          : t.failed;
    return (
      <p aria-label={t.understood} className="w-full text-neutral-600">
        {text}
      </p>
    );
  }
  const proposal = interpretation.proposal;
  const missing = proposal?.missing ?? interpretation.missing;
  return (
    <div aria-label={t.understood} className="flex w-full flex-col gap-1">
      <p>
        <span className="font-semibold">{commandName(interpretation.command)}</span>
        {(proposal?.fields ?? []).map((field) => (
          <span key={field.key} className="ml-3 text-neutral-700">
            <span className="text-neutral-500">{fieldName(field.key)}:</span> {field.value}
            {field.resolvedFrom === 'context' && (
              <span className="ml-1 rounded bg-sky-100 px-1.5 text-xs font-semibold text-sky-900 uppercase">
                {t.fromScreen}
              </span>
            )}
          </span>
        ))}
        {proposal && (
          <span
            className={`ml-3 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
              proposal.ready ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {proposal.ready ? t.ready : t.notReady}
          </span>
        )}
      </p>
      {missing.length > 0 && (
        <p className="font-medium text-amber-800">
          {t.missing.replace('{fields}', missing.map(entityName).join(', '))}
        </p>
      )}
      {proposal?.problems.map((problem) => (
        <p key={problem} className="text-amber-800">
          {problem}
        </p>
      ))}
      {proposal?.alternatives.map((alternative) => (
        <p key={alternative.key} className="text-amber-800">
          {fieldName(alternative.key)}:{' '}
          {t.orOptions.replace('{options}', alternative.options.join(', '))}
        </p>
      ))}
      {!interpretation.proposed && <p className="text-neutral-500">{t.notProposed}</p>}
    </div>
  );
}

/** Seconds left before the proposal expires, ticking. */
function useSecondsLeft(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000)) : 0;
}

/**
 * What is waiting for confirmation (V6): its fields, how it may be confirmed, and Confirm, Edit
 * and Cancel. R3, or anything raised to it, says a click is needed and why.
 */
function PendingCard({
  pending,
  onConfirm,
  onCancel,
  onEdit,
}: {
  pending: PendingProposal;
  onConfirm: () => Promise<void>;
  onCancel: () => Promise<void>;
  onEdit: (entities: Record<string, string>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const entityNames = Object.keys(VOICE_COMMANDS[pending.type as CommandType]?.entities ?? {});
  const [values, setValues] = useState<Record<string, string>>({});
  const secondsLeft = useSecondsLeft(pending.expiresAt);
  const ready = pending.proposal?.ready ?? false;
  const risk = pending.risk;

  useEffect(() => {
    setValues({ ...(pending.entities ?? {}) });
    setEditing(false);
  }, [pending.id, pending.entities]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={t.waiting}
      className="flex w-full flex-col gap-2 rounded-lg border-2 border-dashed border-amber-500 bg-amber-50 p-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-amber-900">{t.waiting}</span>
        <span className="font-semibold">{commandName(pending.type)}</span>
        {(pending.proposal?.fields ?? []).map((field) => (
          <span key={field.key} className="text-neutral-800">
            <span className="text-neutral-500">{fieldName(field.key)}:</span> {field.value}
            {field.resolvedFrom === 'context' && (
              <span className="ml-1 rounded bg-sky-100 px-1.5 text-xs font-semibold text-sky-900 uppercase">
                {t.fromScreen}
              </span>
            )}
          </span>
        ))}
        <span className="text-xs text-neutral-500">
          {t.expiresIn.replace('{seconds}', String(secondsLeft))}
        </span>
      </div>
      {ready && risk && (
        <p className="text-sm text-neutral-700">
          {risk.confirmation === 'click' ? t.clickOnly : t.sayYes}
          {risk.reasons.length > 0 && (
            <span className="text-amber-800"> · {risk.reasons.join(' ')}</span>
          )}
        </p>
      )}
      {editing && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => onEdit(values));
          }}
        >
          {entityNames.map((name) => (
            <label key={name} className="flex flex-col text-sm">
              <span className="text-neutral-600">{entityName(name)}</span>
              <input
                className="h-11 w-40 rounded-lg border border-neutral-300 px-2 text-base"
                value={values[name] ?? ''}
                onChange={(event) => setValues({ ...values, [name]: event.target.value })}
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-lg border border-neutral-300 bg-white px-4 font-medium"
          >
            {t.saveEdit}
          </button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void run(onConfirm)}
          className="h-12 rounded-lg bg-neutral-900 px-6 text-base font-semibold text-white disabled:bg-neutral-400"
        >
          {busy ? t.confirming : t.confirm}
        </button>
        {entityNames.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(!editing)}
            className="h-12 rounded-lg border border-neutral-300 bg-white px-5 font-medium"
          >
            {t.edit}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(onCancel)}
          className="h-12 rounded-lg border border-neutral-300 bg-white px-5 font-medium"
        >
          {t.cancel}
        </button>
      </div>
    </section>
  );
}

function TypeCommand({ send }: { send: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await send(text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 basis-72 items-center gap-2">
      <label htmlFor="voice-type" className="sr-only">
        {t.typeLabel}
      </label>
      <input
        id="voice-type"
        className="h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 text-base"
        placeholder={t.typePlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="h-11 rounded-lg border border-neutral-300 px-4 font-medium hover:bg-neutral-50 disabled:opacity-50"
      >
        {t.send}
      </button>
    </form>
  );
}

/** Typing in a field must never start talking. */
function typingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
  );
}

export function VoiceBar() {
  const voice = useVoice();
  const { press, release } = voice;

  useEffect(() => {
    if (!voice.available) return;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || typingTarget(event.target)) return;
      event.preventDefault();
      press();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, [voice.available, press, release]);

  if (!voice.available) {
    return (
      <span>
        <span className="mr-2 inline-block size-2.5 rounded-full bg-neutral-300 align-middle" />
        {t.states.unavailable}
      </span>
    );
  }

  const notice =
    voice.notice === 'lost'
      ? t.lost
      : voice.notice === 'dropped'
        ? t.dropped
        : voice.notice === 'micBlocked'
          ? t.micBlocked
          : voice.notice === 'speechFailed'
            ? t.speechFailed
            : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        aria-pressed={voice.talking}
        disabled={voice.connection === 'unavailable'}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
            event.preventDefault();
            press();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === ' ') release();
        }}
        className={`h-12 min-w-44 touch-none rounded-full px-6 text-base font-semibold select-none ${
          voice.talking ? 'bg-red-600 text-white' : 'bg-neutral-900 text-white hover:bg-neutral-800'
        }`}
      >
        {voice.talking ? t.talking : t.talk}
      </button>
      <span className="hidden text-neutral-500 sm:inline">{t.spaceHint}</span>

      <span role="status" className="flex items-center gap-2 text-neutral-700">
        <span className={`inline-block size-2.5 rounded-full ${DOT[voice.connection]}`} />
        {t.states[voice.connection]}
        {voice.pendingMs >= 500 && (
          <span className="font-semibold text-amber-800">
            · {t.pending.replace('{seconds}', (voice.pendingMs / 1000).toFixed(1))}
          </span>
        )}
      </span>

      {voice.micOpen && (
        <span className="flex items-center gap-2">
          <span
            role="meter"
            aria-label={t.level}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(voice.level * 100)}
            className="h-2 w-24 overflow-hidden rounded-full bg-neutral-200"
          >
            <span
              className={`block h-full ${voice.talking ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.round(voice.level * 100)}%` }}
            />
          </span>
          <button
            type="button"
            onClick={voice.micOff}
            className="h-11 rounded-lg border border-neutral-300 px-3 text-sm hover:bg-neutral-50"
          >
            {t.micOff}
          </button>
        </span>
      )}

      {voice.lastHeardMs !== null && !voice.talking && (
        <span className="text-neutral-700">
          {t.heard.replace('{seconds}', (voice.lastHeardMs / 1000).toFixed(1))}
        </span>
      )}
      <TypeCommand send={voice.type} />
      {voice.speech === false && <span className="text-neutral-500">{t.speechOff}</span>}
      {voice.speech && (
        <p
          aria-label={t.transcript}
          aria-live="polite"
          className={`w-full text-lg ${
            voice.transcript?.final ? 'font-medium text-neutral-900' : 'text-neutral-500 italic'
          }`}
        >
          {voice.transcript
            ? voice.transcript.text || (voice.transcript.final ? t.nothingHeard : '…')
            : t.notYet}
        </p>
      )}
      {voice.interpretation && !voice.pending && (
        <Understood interpretation={voice.interpretation} />
      )}
      {voice.pending && (
        <PendingCard
          pending={voice.pending}
          onConfirm={voice.confirm}
          onCancel={voice.cancel}
          onEdit={voice.edit}
        />
      )}
      {voice.outcome && (
        <p aria-live="polite" className={voice.outcome.ok ? 'text-emerald-800' : 'text-red-700'}>
          {voice.outcome.ok
            ? voice.outcome.message
            : t.confirmFailed.replace('{reason}', voice.outcome.message)}
        </p>
      )}
      {notice && (
        <span role="alert" className="w-full text-amber-800">
          {notice}
        </span>
      )}
    </div>
  );
}
