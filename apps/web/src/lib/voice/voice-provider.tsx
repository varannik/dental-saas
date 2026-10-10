'use client';

import {
  VOICE_FRAME_SAMPLES,
  VOICE_SAMPLE_RATE,
  type PendingProposal,
  type VoiceFocusUpdate,
  type VoiceInterpretation,
} from '@dental/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, API_URL, ApiError, COMMAND_EVENT } from '../api';
import { newIdempotencyKey } from '../patients';
import { useSession } from '../session';
import { Microphone } from './microphone';
import { EnergyVad } from './vad';
import { VoiceRefused, VoiceSocket, type VoiceConnection } from './voice-socket';

/**
 * Voice for the whole signed-in app (V1): one stream per tab, kept across page changes. Push to
 * talk opens the microphone the first time; while held, speech (not silence) is streamed.
 */

const FRAME_MS = (VOICE_FRAME_SAMPLES / VOICE_SAMPLE_RATE) * 1000;
/** Audio still sent after release, so the last word is not cut (ADR 0001). */
const RELEASE_TAIL_MS = 300;
const UI_REFRESH_MS = 100;

export type VoiceNotice = 'lost' | 'dropped' | 'micBlocked' | 'speechFailed';

/** What was recognised: live while talking, then the final text. */
export interface VoiceTranscript {
  utteranceId: string;
  text: string;
  final: boolean;
}

interface VoiceValue {
  available: boolean;
  connection: VoiceConnection;
  talking: boolean;
  micOpen: boolean;
  /** Microphone level, 0 to 1. */
  level: number;
  /** Speech recorded but not yet acknowledged by the server. */
  pendingMs: number;
  lastHeardMs: number | null;
  /** Whether the server transcribes speech; null until connected. */
  speech: boolean | null;
  transcript: VoiceTranscript | null;
  /** What the last utterance, spoken or typed, was understood as (V4). */
  interpretation: VoiceInterpretation | null;
  /** What is waiting for confirmation (V6). */
  pending: PendingProposal | null;
  /** The answer to the last confirm, cancel, correction or undo. */
  outcome: { ok: boolean; message: string } | null;
  notice: VoiceNotice | null;
  press(): void;
  release(): void;
  micOff(): void;
  /** Tells the voice context what is on screen (V3). */
  setFocus(focus: VoiceFocusUpdate): void;
  /** Sends typed text through the same pipeline as speech. */
  type(text: string): Promise<void>;
  confirm(): Promise<void>;
  cancel(): Promise<void>;
  edit(entities: Record<string, string>): Promise<void>;
  undo(): Promise<void>;
}

const VoiceContext = createContext<VoiceValue | null>(null);

export const streamUrl = (apiUrl = API_URL) => `${apiUrl.replace(/^http/, 'ws')}/v1/voice/stream`;

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { state, authed } = useSession();
  const available = state.status === 'signed_in' && state.session.permissions.includes('voice.use');
  const userId = state.status === 'signed_in' ? state.session.user.id : null;

  const [connection, setConnection] = useState<VoiceConnection>('idle');
  const [talking, setTalking] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [level, setLevel] = useState(0);
  const [pendingMs, setPendingMs] = useState(0);
  const [lastHeardMs, setLastHeardMs] = useState<number | null>(null);
  const [notice, setNotice] = useState<VoiceNotice | null>(null);
  const [speech, setSpeech] = useState<boolean | null>(null);
  const [transcript, setTranscript] = useState<VoiceTranscript | null>(null);
  const [interpretation, setInterpretation] = useState<VoiceInterpretation | null>(null);
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

  const socketRef = useRef<VoiceSocket | null>(null);
  const micRef = useRef<Microphone | null>(null);
  const vadRef = useRef(new EnergyVad());
  const talkingRef = useRef(false);
  const releasingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedRef = useRef(false);

  const authedRef = useRef(authed);
  authedRef.current = authed;

  useEffect(() => {
    if (!available || !userId) return;
    const socket = new VoiceSocket({
      url: streamUrl(),
      getTicket: async () => {
        try {
          return (await authedRef.current((token) => api.voiceTicket(token))).ticket;
        } catch (error) {
          if (error instanceof ApiError && error.status === 403) throw new VoiceRefused();
          throw error;
        }
      },
      onState: setConnection,
      onEvent: (event) => {
        if (event.type === 'ready') setSpeech(event.speech);
        if (event.type === 'utterance.ended') setLastHeardMs(event.durationMs);
        if (event.type === 'utterance.lost') setNotice('lost');
        if (event.type === 'transcript.partial') {
          // A final transcript is never replaced by a late partial of the same utterance.
          setTranscript((shown) =>
            shown?.utteranceId === event.utteranceId && shown.final
              ? shown
              : { utteranceId: event.utteranceId, text: event.text, final: false }
          );
        }
        if (event.type === 'transcript.final') {
          setTranscript({ utteranceId: event.utteranceId, text: event.text, final: true });
        }
        if (event.type === 'interpretation') {
          const result = event.interpretation;
          setInterpretation(result);
          setPending(result.pending);
          if (result.control) {
            setOutcome({ ok: result.control.ok, message: result.control.message });
            // A command confirmed by voice ran on the server: screens refresh.
            if (result.control.commandId) window.dispatchEvent(new Event(COMMAND_EVENT));
          } else setOutcome(null);
        }
        if (event.type === 'error' && event.code === 'speech_failed') setNotice('speechFailed');
      },
    });
    socketRef.current = socket;
    // A proposal may already be waiting, from before this page loaded.
    void authedRef
      .current((token) => api.voiceContext(token))
      .then((context) => setPending(context.pending))
      .catch(() => undefined);
    const online = () => socket.setOnline(true);
    const offline = () => socket.setOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    socket.setOnline(navigator.onLine);
    socket.connect();
    const ui = setInterval(() => {
      setLevel(micRef.current?.open ? vadRef.current.level : 0);
      setPendingMs(socket.pending * FRAME_MS);
    }, UI_REFRESH_MS);
    return () => {
      clearInterval(ui);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      socket.stop();
      socketRef.current = null;
      micRef.current?.stop();
      micRef.current = null;
      setMicOpen(false);
    };
  }, [available, userId]);

  const onFrame = useCallback((frame: Int16Array) => {
    const socket = socketRef.current;
    const speech = vadRef.current.push(frame);
    if (!socket || !talkingRef.current) return;
    // During the release tail everything is sent, speech or not.
    for (const out of releasingRef.current ? [frame] : speech) socket.audio(out);
  }, []);

  const finish = useCallback(() => {
    releasingRef.current = null;
    talkingRef.current = false;
    const socket = socketRef.current;
    if (socket && socket.dropped > 0) setNotice('dropped');
    socket?.endUtterance();
  }, []);

  const press = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || pressedRef.current) return;
    pressedRef.current = true;
    if (releasingRef.current) {
      clearTimeout(releasingRef.current);
      finish();
    }
    setNotice(null);
    micRef.current ??= new Microphone(onFrame);
    void micRef.current.start().then(
      () => {
        setMicOpen(true);
        // Released while the permission prompt was open.
        if (!pressedRef.current) return;
        socket.startUtterance();
        talkingRef.current = true;
        setTalking(true);
      },
      () => {
        pressedRef.current = false;
        micRef.current = null;
        setNotice('micBlocked');
      }
    );
  }, [finish, onFrame]);

  const release = useCallback(() => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    setTalking(false);
    if (!talkingRef.current) return;
    releasingRef.current = setTimeout(finish, RELEASE_TAIL_MS);
  }, [finish]);

  // The last focus sent, so an unchanged screen sends nothing.
  const focusRef = useRef<string | null>(null);
  const setFocus = useCallback(
    (focus: VoiceFocusUpdate) => {
      if (!available) return;
      const key = JSON.stringify(focus);
      if (key === focusRef.current) return;
      focusRef.current = key;
      void authedRef
        .current((token) => api.setVoiceFocus(token, focus))
        .catch(() => {
          // Sent again with the next change of screen.
          focusRef.current = null;
        });
    },
    [available]
  );

  const type = useCallback(async (text: string) => {
    const result = await authedRef.current((token) => api.interpret(token, text));
    setTranscript({ utteranceId: result.utteranceId, text, final: true });
    setInterpretation(result);
    setPending(result.pending);
    if (result.control) {
      setOutcome({ ok: result.control.ok, message: result.control.message });
      if (result.control.commandId) window.dispatchEvent(new Event(COMMAND_EVENT));
    } else setOutcome(null);
  }, []);

  /** Runs a proposal action, showing the server's reason when it is refused. */
  const act = useCallback(
    async (work: (token: string) => Promise<PendingProposal | null>, ok: string) => {
      try {
        const next = await authedRef.current(work);
        setPending(next);
        setOutcome({ ok: true, message: ok });
      } catch (error) {
        const reason = error instanceof ApiError ? error.message : 'unknown error';
        setOutcome({ ok: false, message: reason });
        if (error instanceof ApiError && [404, 409, 410].includes(error.status)) setPending(null);
      }
    },
    []
  );

  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const confirm = useCallback(async () => {
    const current = pendingRef.current;
    if (!current) return;
    await act(async (token) => {
      await api.confirmProposal(token, current.id, current.contextVersion, newIdempotencyKey());
      return null;
    }, 'Done.');
  }, [act]);

  const cancel = useCallback(async () => {
    const current = pendingRef.current;
    if (!current) return;
    await act(async (token) => {
      await api.cancelProposal(token, current.id);
      return null;
    }, 'Cancelled.');
  }, [act]);

  const edit = useCallback(
    async (entities: Record<string, string>) => {
      const current = pendingRef.current;
      if (!current) return;
      await act(
        (token) => api.editProposal(token, current.id, current.contextVersion, entities),
        'Changed; waiting for confirmation.'
      );
    },
    [act]
  );

  const undo = useCallback(async () => {
    await act((token) => api.undoVoice(token), 'Undo is waiting for confirmation.');
  }, [act]);

  const micOff = useCallback(() => {
    release();
    micRef.current?.stop();
    micRef.current = null;
    setMicOpen(false);
  }, [release]);

  const value = useMemo<VoiceValue>(
    () => ({
      available,
      connection,
      talking,
      micOpen,
      level,
      pendingMs,
      lastHeardMs,
      speech,
      transcript,
      interpretation,
      pending,
      outcome,
      notice,
      press,
      release,
      micOff,
      setFocus,
      type,
      confirm,
      cancel,
      edit,
      undo,
    }),
    [
      available,
      connection,
      talking,
      micOpen,
      level,
      pendingMs,
      lastHeardMs,
      speech,
      transcript,
      interpretation,
      pending,
      outcome,
      notice,
      press,
      release,
      micOff,
      setFocus,
      type,
      confirm,
      cancel,
      edit,
      undo,
    ]
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceValue {
  const value = useContext(VoiceContext);
  if (!value) throw new Error('useVoice needs a VoiceProvider');
  return value;
}

/**
 * Declares the screen's focus: the patient, session, procedure and tooth it shows. Pass
 * undefined while loading, so a page that does not know its patient yet changes nothing.
 */
export function useVoiceFocus(focus: VoiceFocusUpdate | undefined) {
  const { setFocus } = useVoice();
  const key = focus ? JSON.stringify(focus) : null;
  useEffect(() => {
    if (key) setFocus(JSON.parse(key) as VoiceFocusUpdate);
  }, [key, setFocus]);
}
