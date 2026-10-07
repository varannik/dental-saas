'use client';

import { VOICE_FRAME_SAMPLES, VOICE_SAMPLE_RATE } from '@dental/contracts';
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
import { api, API_URL, ApiError } from '../api';
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

export type VoiceNotice = 'lost' | 'dropped' | 'micBlocked';

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
  notice: VoiceNotice | null;
  press(): void;
  release(): void;
  micOff(): void;
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
        if (event.type === 'utterance.ended') setLastHeardMs(event.durationMs);
        if (event.type === 'utterance.lost') setNotice('lost');
      },
    });
    socketRef.current = socket;
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
      notice,
      press,
      release,
      micOff,
    }),
    [
      available,
      connection,
      talking,
      micOpen,
      level,
      pendingMs,
      lastHeardMs,
      notice,
      press,
      release,
      micOff,
    ]
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceValue {
  const value = useContext(VoiceContext);
  if (!value) throw new Error('useVoice needs a VoiceProvider');
  return value;
}
