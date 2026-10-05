'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import messages from '../messages/en.json';
import { useSession } from '../lib/session';

/** Shows its children only when signed in; otherwise sends the user to sign in. */
export function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { state } = useSession();

  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/sign-in');
  }, [router, state.status]);

  if (state.status !== 'signed_in') {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">
        {messages.shell.loading}
      </div>
    );
  }
  return <>{children}</>;
}
