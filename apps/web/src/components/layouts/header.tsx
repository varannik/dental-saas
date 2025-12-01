'use client';

import { useSession, signOut } from 'next-auth/react';

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="flex h-16 items-center justify-between border-b px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Dashboard</h2>
      </div>
      <div className="flex items-center gap-4">
        {session?.user && (
          <>
            <span className="text-sm text-gray-600">{session.user.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium hover:bg-gray-200"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}

