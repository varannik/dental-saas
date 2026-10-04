'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import messages from '../../../messages/en.json';

/**
 * Voice spike (F7): push-to-talk capture, streamed to the API, proposal and timings back.
 * Throwaway screen for measuring latency; the real voice bar and proposal card are V7.
 */

const t = messages.voiceSpike;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SOCKET_URL = `${API_URL.replace(/^http/, 'ws')}/v1/voice/spike`;

interface Field {
  key: string;
  label: string;
  value: string | null;
  resolvedFrom: string | null;
  alternatives: string[];
}

interface Command {
  display: { summary: string; fields: Field[] };
  interpretation: { intentConfidence: number; sttConfidence: number; model: string };
  risk: { tier: string; confirmation: string; reasons: string[] };
  missing: string[];
  question: string | null;
}

type Result = { kind: 'proposal'; command: Command } | { kind: 'no_command'; reason: string };

interface Timings {
  sttFinalizeMs: number;
  interpretMs: number;
  resolveMs: number;
  serverTotalMs: number;
  audioMs: number;
}

interface Attempt {
  at: string;
  transcript: string;
  sttConfidence: number;
  activeTooth: string | null;
  result: Result;
  timings: Timings;
  roundTripMs: number;
}

type ServerMessage =
  | { type: 'ready' }
  | { type: 'partial'; text: string }
  | { type: 'transcript'; transcript: string; confidence: number }
  | { type: 'result'; result: Result; timings: Timings }
  | { type: 'error'; message: string };

interface Audio {
  context: AudioContext;
  node: AudioWorkletNode;
  stream: MediaStream;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(Math.max(Math.ceil((p / 100) * sorted.length) - 1, 0), sorted.length - 1)
  ]!;
}

const ms = (value: number) => `${Math.round(value).toLocaleString('en')} ms`;

const STAGES: { label: string; pick: (attempt: Attempt) => number }[] = [
  { label: t.stage.roundTrip, pick: (a) => a.roundTripMs },
  { label: t.stage.server, pick: (a) => a.timings.serverTotalMs },
  { label: t.stage.stt, pick: (a) => a.timings.sttFinalizeMs },
  { label: t.stage.llm, pick: (a) => a.timings.interpretMs },
  { label: t.stage.resolve, pick: (a) => a.timings.resolveMs },
  { label: t.stage.network, pick: (a) => a.roundTripMs - a.timings.serverTotalMs },
];

export default function VoiceSpikePage() {
  const [connection, setConnection] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [phase, setPhase] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [partial, setPartial] = useState('');
  const [current, setCurrent] = useState<Attempt | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [decision, setDecision] = useState<'confirmed' | 'cancelled' | null>(null);
  const [activeTooth, setActiveTooth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<Audio | null>(null);
  const pressedRef = useRef(false);
  const recordingRef = useRef(false);
  const releasedAtRef = useRef(0);
  const transcriptRef = useRef({ transcript: '', confidence: 0 });
  const activeToothRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    socketRef.current?.close();
    setConnection('connecting');
    const socket = new WebSocket(SOCKET_URL);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => setConnection('open');
    socket.onclose = () => {
      setConnection('closed');
      setPhase('idle');
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'partial') setPartial(message.text);
      else if (message.type === 'transcript') {
        transcriptRef.current = message;
        setPartial(message.transcript);
      } else if (message.type === 'result') {
        const attempt: Attempt = {
          at: new Date().toISOString(),
          transcript: transcriptRef.current.transcript,
          sttConfidence: transcriptRef.current.confidence,
          activeTooth: activeToothRef.current,
          result: message.result,
          timings: message.timings,
          roundTripMs: performance.now() - releasedAtRef.current,
        };
        setCurrent(attempt);
        setAttempts((previous) => [attempt, ...previous]);
        setDecision(null);
        setPhase('idle');
      } else if (message.type === 'error') {
        setError(message.message);
        setPhase('idle');
      }
    };
    socketRef.current = socket;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
      audioRef.current?.stream.getTracks().forEach((track) => track.stop());
      void audioRef.current?.context.close();
    };
  }, [connect]);

  const ensureAudio = useCallback(async (): Promise<Audio> => {
    if (audioRef.current) return audioRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const context = new AudioContext();
    await context.audioWorklet.addModule('/worklets/pcm16.js');
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'pcm16');
    // A silent path to the output keeps the worklet running in every browser.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(context.destination);
    node.port.onmessage = (event: MessageEvent<{ type: string; buffer: ArrayBuffer }>) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (event.data.type === 'frame' && recordingRef.current) socket.send(event.data.buffer);
      if (event.data.type === 'flushed') {
        if (event.data.buffer.byteLength > 0) socket.send(event.data.buffer);
        socket.send(JSON.stringify({ type: 'stop' }));
      }
    };
    audioRef.current = { context, node, stream };
    return audioRef.current;
  }, []);

  const press = useCallback(async () => {
    if (pressedRef.current || phase !== 'idle' || connection !== 'open') return;
    pressedRef.current = true;
    setError(null);
    let audio: Audio;
    try {
      audio = await ensureAudio();
    } catch {
      pressedRef.current = false;
      setError(t.micBlocked);
      return;
    }
    // Released while the permission prompt was open.
    if (!pressedRef.current) return;
    await audio.context.resume();
    activeToothRef.current = activeTooth.trim() || null;
    socketRef.current?.send(
      JSON.stringify({
        type: 'start',
        context: activeToothRef.current ? { activeTooth: activeToothRef.current } : {},
      })
    );
    transcriptRef.current = { transcript: '', confidence: 0 };
    recordingRef.current = true;
    setPartial('');
    setCurrent(null);
    setPhase('listening');
  }, [activeTooth, connection, ensureAudio, phase]);

  const release = useCallback(() => {
    pressedRef.current = false;
    if (!recordingRef.current) return;
    recordingRef.current = false;
    releasedAtRef.current = performance.now();
    setPhase('processing');
    audioRef.current?.node.port.postMessage('flush');
  }, []);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return;
      event.preventDefault();
      void press();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTyping(event.target)) return;
      event.preventDefault();
      release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [press, release]);

  const copy = async () => {
    const summary = Object.fromEntries(
      STAGES.map((stage) => {
        const series = attempts.map(stage.pick);
        return [stage.label, { p50: percentile(series, 50), p95: percentile(series, 95) }];
      })
    );
    await navigator.clipboard.writeText(
      JSON.stringify({ userAgent: navigator.userAgent, summary, attempts }, null, 2)
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const buttonLabel =
    phase === 'listening' ? t.listening : phase === 'processing' ? t.processing : t.hold;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 text-base">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t.title}</h1>
        <p className="text-neutral-700">{t.intro}</p>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.notice}</p>
      </header>

      <section className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
            connection === 'open'
              ? 'bg-emerald-50 text-emerald-800'
              : connection === 'connecting'
                ? 'bg-neutral-100 text-neutral-700'
                : 'bg-red-50 text-red-800'
          }`}
        >
          <span className="size-2 rounded-full bg-current" />
          {t.connection[connection]}
        </span>
        {connection === 'closed' && (
          <button
            type="button"
            onClick={connect}
            className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50"
          >
            {t.connection.retry}
          </button>
        )}
        <span className="text-neutral-500">{SOCKET_URL}</span>
      </section>

      <label className="flex max-w-sm flex-col gap-1">
        <span className="font-medium">{t.activeTooth}</span>
        <input
          value={activeTooth}
          onChange={(event) => setActiveTooth(event.target.value)}
          placeholder="16"
          className="h-12 rounded-md border border-neutral-300 px-3 text-lg"
        />
        <span className="text-sm text-neutral-500">{t.activeToothHint}</span>
      </label>

      <button
        type="button"
        disabled={connection !== 'open' || phase === 'processing'}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          void press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(event) => event.preventDefault()}
        className={`h-28 select-none rounded-2xl text-2xl font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-neutral-300 ${
          phase === 'listening' ? 'bg-red-600' : 'bg-neutral-900 hover:bg-neutral-800'
        }`}
      >
        {buttonLabel}
      </button>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-800">{error}</p>}

      {(partial || phase !== 'idle') && (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            {t.heard}
          </h2>
          <p className="min-h-8 text-xl">{partial || '…'}</p>
        </section>
      )}

      {current && <ResultCard attempt={current} decision={decision} onDecide={setDecision} />}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">
            {t.history} ({attempts.length})
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={attempts.length === 0}
              onClick={() => void copy()}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {copied ? t.copied : t.copy}
            </button>
            <button
              type="button"
              disabled={attempts.length === 0}
              onClick={() => {
                setAttempts([]);
                setCurrent(null);
              }}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {t.clear}
            </button>
          </div>
        </div>
        <p className="text-sm text-neutral-600">{t.target}</p>
        {attempts.length === 0 ? (
          <p className="text-neutral-500">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">{t.timings}</th>
                  <th className="py-2 pr-4 font-medium">p50</th>
                  <th className="py-2 pr-4 font-medium">p95</th>
                  <th className="py-2 font-medium">max</th>
                </tr>
              </thead>
              <tbody>
                {STAGES.map((stage) => {
                  const series = attempts.map(stage.pick);
                  return (
                    <tr key={stage.label} className="border-t border-neutral-200">
                      <td className="py-2 pr-4">{stage.label}</td>
                      <td className="py-2 pr-4 tabular-nums">{ms(percentile(series, 50))}</td>
                      <td className="py-2 pr-4 tabular-nums">{ms(percentile(series, 95))}</td>
                      <td className="py-2 tabular-nums">{ms(Math.max(...series))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function ResultCard({
  attempt,
  decision,
  onDecide,
}: {
  attempt: Attempt;
  decision: 'confirmed' | 'cancelled' | null;
  onDecide: (decision: 'confirmed' | 'cancelled') => void;
}) {
  const { result, timings } = attempt;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border-2 border-dashed border-neutral-400 p-5">
      {result.kind === 'no_command' ? (
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{t.noCommand}</h2>
          <p className="text-neutral-700">{result.reason}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl font-semibold">{result.command.display.summary}</h2>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm">
              {t.risk} {result.command.risk.tier} · {result.command.risk.reasons.join(', ')}
            </span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {result.command.display.fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <dt className="text-sm text-neutral-500">{field.label}</dt>
                <dd className="text-xl font-medium">{field.value ?? '—'}</dd>
                {field.resolvedFrom && (
                  <dd
                    className={`w-fit rounded px-2 py-0.5 text-sm ${
                      field.resolvedFrom === 'context'
                        ? 'border border-dashed border-amber-500 text-amber-800'
                        : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    {field.resolvedFrom === 'context'
                      ? t.fromContext
                      : `${t.said} “${field.resolvedFrom}”`}
                  </dd>
                )}
                {field.alternatives.length > 0 && (
                  <dd className="text-sm text-neutral-600">
                    {t.alternatives}: {field.alternatives.join(', ')}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          {result.command.question && (
            <p className="text-lg font-medium text-amber-800">{result.command.question}</p>
          )}
          {decision ? (
            <p className="font-medium">{decision === 'confirmed' ? t.confirmed : t.cancelled}</p>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={result.command.missing.length > 0}
                onClick={() => onDecide('confirmed')}
                className="h-12 min-w-32 rounded-lg bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800 disabled:bg-neutral-300"
              >
                {t.confirm}
              </button>
              <button
                type="button"
                onClick={() => onDecide('cancelled')}
                className="h-12 min-w-32 rounded-lg border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
              >
                {t.cancel}
              </button>
            </div>
          )}
        </>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-neutral-200 pt-3 text-sm sm:grid-cols-3">
        {STAGES.map((stage) => (
          <div key={stage.label} className="flex justify-between gap-2">
            <dt className="text-neutral-500">{stage.label}</dt>
            <dd className="tabular-nums">{ms(stage.pick(attempt))}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-500">{t.stage.audio}</dt>
          <dd className="tabular-nums">{ms(timings.audioMs)}</dd>
        </div>
      </dl>
    </section>
  );
}
