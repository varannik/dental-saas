'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useState } from 'react';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { DashboardHeader } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { fetchAuthMe } from '@/lib/auth-session';
import { useActiveTenant } from '@/hooks/use-active-tenant';
import { initAuthFromStorage, useAuthStore } from '@/stores/auth.store';

type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const setSession = useAuthStore((s) => s.setSession);
  const [hydrated, setHydrated] = useState(false);
  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useActiveTenant();

  useLayoutEffect(() => {
    initAuthFromStorage();
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    let cancelled = false;
    void (async () => {
      const me = await fetchAuthMe(accessToken);
      if (cancelled) return;
      if (!me) {
        clearSession();
        return;
      }
      const current = useAuthStore.getState().tenantId;
      if (me.tenantId !== current) {
        setSession(accessToken, me.tenantId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, accessToken, clearSession, setSession]);

  useLayoutEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [hydrated, accessToken, router, pathname]);

  const onSignOut = () => {
    clearSession();
    router.replace('/login');
  };

  if (!hydrated || !accessToken) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        Loading workspace…
      </div>
    );
  }

  let practiceName = 'Practice';
  if (tenantLoading) {
    practiceName = 'Loading…';
  } else if (tenantError || !tenant) {
    practiceName = 'Practice (unknown)';
  } else {
    practiceName = tenant.name;
  }

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <DashboardHeader onSignOut={onSignOut} practiceName={practiceName} />
        <div className="border-b px-4 py-3 md:px-6">
          <Breadcrumbs />
        </div>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
