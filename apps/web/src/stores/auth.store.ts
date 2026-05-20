import { create } from 'zustand';

import {
  getStoredAccessToken,
  getStoredTenantId,
  setStoredAccessToken,
  setStoredTenantId,
} from '@/lib/auth-storage';
import { setStoredLastLoginEmail } from '@/lib/login-email-storage';

type AuthState = {
  accessToken: string | null;
  tenantId: string | null;
  setSession: (token: string | null, tenantId?: string | null) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  tenantId: null,
  setSession: (token, tenantId) => {
    if (token === null) {
      setStoredAccessToken(null);
      setStoredTenantId(null);
      set({ accessToken: null, tenantId: null });
      return;
    }

    let nextTenantId = tenantId;
    if (nextTenantId === undefined) {
      nextTenantId = get().tenantId ?? getStoredTenantId();
    }

    setStoredAccessToken(token);

    if (nextTenantId === null || nextTenantId === '') {
      setStoredTenantId(null);
      set({ accessToken: token, tenantId: null });
      return;
    }

    setStoredTenantId(nextTenantId);
    set({ accessToken: token, tenantId: nextTenantId });
  },
  clearSession: () => {
    setStoredAccessToken(null);
    setStoredTenantId(null);
    setStoredLastLoginEmail(null);
    set({ accessToken: null, tenantId: null });
  },
}));

/** Hydrate token + active tenant from storage (client-only). */
export function initAuthFromStorage(): void {
  const token = getStoredAccessToken();
  const tenantId = getStoredTenantId();
  if (token) {
    useAuthStore.setState({ accessToken: token, tenantId });
  }
}
