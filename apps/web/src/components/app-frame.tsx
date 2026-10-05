'use client';

import type { ReactNode } from 'react';
import messages from '../messages/en.json';
import { useSession } from '../lib/session';

/**
 * The persistent frame every clinical screen shares (spec section K): who is signed in and
 * where, the patient banner, the session strip, the workspace, and the voice bar. Patients,
 * sessions and voice fill their regions in the clinical-core and voice milestones.
 */

const t = messages.shell;

export function AppFrame({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession();
  if (state.status !== 'signed_in') return null;
  const { session } = state;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-base">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold">{session.clinic.name}</span>
          <span className="text-sm text-neutral-500">{messages.app.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-600">
            {session.user.email} · <span className="capitalize">{session.role}</span>
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="h-11 rounded-lg border border-neutral-300 px-4 font-medium hover:bg-neutral-50"
          >
            {t.signOut}
          </button>
        </div>
      </header>

      {/* Patient banner: name, age, file number and alerts once a patient is open. */}
      <section
        aria-label="Patient"
        className="border-b border-neutral-200 bg-white px-4 py-3 text-neutral-500"
      >
        {t.noPatient}
      </section>
      {/* Session strip: time, active procedure, tooth and running material cost. */}
      <section
        aria-label="Session"
        className="border-b border-neutral-200 bg-neutral-100 px-4 py-2 text-sm text-neutral-500"
      >
        {t.noSession}
      </section>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

      {/* Voice bar: microphone state, live transcript and the last acknowledgement. */}
      <footer
        aria-label="Voice"
        className="sticky bottom-0 border-t border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500"
      >
        <span className="mr-2 inline-block size-2.5 rounded-full bg-neutral-300 align-middle" />
        {t.voiceOff}
      </footer>
    </div>
  );
}
