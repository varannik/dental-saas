'use client';

import { useEffect } from 'react';
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
      {notice && (
        <span role="alert" className="w-full text-amber-800">
          {notice}
        </span>
      )}
    </div>
  );
}
