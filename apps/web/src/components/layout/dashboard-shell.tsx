'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLayoutEffect, useState } from 'react';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { DashboardHeader } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { initAuthFromStorage, useAuthStore } from '@/stores/auth.store';

type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    initAuthFromStorage();
    setHydrated(true);
  }, []);

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

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <DashboardHeader onSignOut={onSignOut} />
        <div className="border-b px-4 py-3 md:px-6">
          <Breadcrumbs />
        </div>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
