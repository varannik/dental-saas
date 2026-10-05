import type { SessionResponse } from '@dental/contracts';
import { ApiError } from './api';

/**
 * Refresh tokens rotate on every use, and presenting a used one ends the session everywhere.
 * So refreshes never overlap: one at a time per tab, and across tabs through the Web Locks
 * API. If another tab still wins the race, the API answers refresh_superseded and the retry
 * uses the newer cookie the browser now holds.
 */

interface Locks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

const LOCK_NAME = 'dental-refresh';
const SUPERSEDED_RETRY_MS = 300;

export function createRefresher(
  refresh: () => Promise<SessionResponse>,
  locks: Locks | undefined = typeof navigator !== 'undefined' ? navigator.locks : undefined,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms))
) {
  let inFlight: Promise<SessionResponse> | null = null;

  const attempt = async () => {
    try {
      return await refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'refresh_superseded') {
        await wait(SUPERSEDED_RETRY_MS);
        return refresh();
      }
      throw error;
    }
  };

  return function refreshSession(): Promise<SessionResponse> {
    inFlight ??= (locks ? locks.request(LOCK_NAME, attempt) : attempt()).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
