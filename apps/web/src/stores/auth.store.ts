import { create } from 'zustand';

import { getStoredAccessToken, setStoredAccessToken } from '@/lib/auth-storage';

type AuthState = {
  accessToken: string | null;
  tenantId: string | null;
  setSession: (token: string | null, tenantId?: string | null) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  /** Injected on login; storage currently only persists access token. */
  tenantId: null,
  setSession: (token, tenantId = null) => {
    setStoredAccessToken(token);
    set({ accessToken: token, tenantId: tenantId ?? null });
  },
  clearSession: () => {
    setStoredAccessToken(null);
    set({ accessToken: null, tenantId: null });
  },
}));

/** Hydrate token from storage after mount (client only). */
export function initAuthFromStorage(): void {
  const token = getStoredAccessToken();
  if (token) {
    useAuthStore.setState({ accessToken: token });
  }
}
