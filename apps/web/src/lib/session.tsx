'use client';

import type { SessionResponse } from '@dental/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from './api';
import { createRefresher } from './refresh';

/**
 * The signed-in session. The access token lives in memory only; the refresh token is an
 * httpOnly cookie the page cannot read. On load the session is restored from the cookie, and
 * the access token is refreshed a minute before it expires.
 */

type SessionState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; session: SessionResponse };

interface SessionContextValue {
  state: SessionState;
  setSession(session: SessionResponse): void;
  signOut(): Promise<void>;
  /** Runs an authenticated call, refreshing the token once if it has expired. */
  authed<T>(call: (token: string) => Promise<T>): Promise<T>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const refreshSession = createRefresher(() => api.refresh());
const REFRESH_AHEAD_SECONDS = 60;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const setSession = useCallback((session: SessionResponse) => {
    setState({ status: 'signed_in', session });
  }, []);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => active && setSession(session))
      .catch(() => active && setState({ status: 'signed_out' }));
    return () => {
      active = false;
    };
  }, [setSession]);

  const expiresIn = state.status === 'signed_in' ? state.session.expiresIn : null;
  const accessToken = state.status === 'signed_in' ? state.session.accessToken : null;
  useEffect(() => {
    if (expiresIn === null) return;
    const delay = Math.max(5, expiresIn - REFRESH_AHEAD_SECONDS) * 1000;
    const timer = setTimeout(() => {
      refreshSession()
        .then(setSession)
        .catch(() => setState({ status: 'signed_out' }));
    }, delay);
    return () => clearTimeout(timer);
  }, [accessToken, expiresIn, setSession]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setState({ status: 'signed_out' });
  }, []);

  const authed = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      if (!accessToken) throw new ApiError(401, 'unauthenticated', {});
      try {
        return await call(accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        try {
          const session = await refreshSession();
          setSession(session);
          return await call(session.accessToken);
        } catch (refreshError) {
          setState({ status: 'signed_out' });
          throw refreshError;
        }
      }
    },
    [accessToken, setSession]
  );

  const value = useMemo(
    () => ({ state, setSession, signOut, authed }),
    [state, setSession, signOut, authed]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
