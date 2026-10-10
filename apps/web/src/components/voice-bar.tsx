'use client';

import type { VoiceInterpretation } from '@dental/contracts';
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

/** One line: what the utterance was understood as, with the words it picked out. */
function Understood({ interpretation }: { interpretation: VoiceInterpretation }) {
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
  const entities = Object.entries(interpretation.entities);
  return (
    <p aria-label={t.understood} className="w-full">
      <span className="font-semibold">{commandName(interpretation.command)}</span>
      {entities.map(([name, value]) => (
        <span key={name} className="ml-3 text-neutral-700">
          <span className="text-neutral-500">{entityName(name)}:</span> {value}
        </span>
      ))}
      {interpretation.missing.length > 0 && (
        <span className="ml-3 font-medium text-amber-800">
          {t.missing.replace('{fields}', interpretation.missing.map(entityName).join(', '))}
        </span>
      )}
      {!interpretation.proposed && <span className="ml-3 text-neutral-500">{t.notProposed}</span>}
    </p>
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
      {voice.interpretation && <Understood interpretation={voice.interpretation} />}
      {notice && (
        <span role="alert" className="w-full text-amber-800">
          {notice}
        </span>
      )}
    </div>
  );
}
