'use client';

import { useEffect } from 'react';

import { initAuthFromStorage, useAuthStore } from '@/stores/auth.store';

export function useAuth() {
  useEffect(() => {
    initAuthFromStorage();
  }, []);

  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  return { accessToken, tenantId, setSession, clearSession };
}
