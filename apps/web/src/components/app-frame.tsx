'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import messages from '../messages/en.json';
import { useSession } from '../lib/session';

/**
 * The persistent frame every clinical screen shares (spec section K): who is signed in and
 * where, the patient banner, the session strip, the workspace, and the voice bar. Patients,
 * sessions and voice fill their regions in the clinical-core and voice milestones.
 */

const t = messages.shell;

const NAV = [
  { href: '/', label: t.nav.home, permission: null },
  { href: '/patients', label: t.nav.patients, permission: 'patient.read' },
] as const;

export function AppFrame({
  children,
  patientBanner,
  sessionStrip,
}: {
  children: ReactNode;
  /** The open patient, shown in the banner on every screen of that patient. */
  patientBanner?: ReactNode;
  /** The open session: time, chief complaint, later the active procedure and running cost. */
  sessionStrip?: ReactNode;
}) {
  const { state, signOut } = useSession();
  const pathname = usePathname();
  if (state.status !== 'signed_in') return null;
  const { session } = state;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-base">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold">{session.clinic.name}</span>
            <span className="text-sm text-neutral-500">{messages.app.name}</span>
          </div>
          <nav className="flex gap-1">
            {NAV.filter(
              (item) => !item.permission || session.permissions.includes(item.permission)
            ).map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-11 items-center rounded-lg px-4 font-medium ${
                    active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
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
        className={`border-b px-4 py-3 ${
          patientBanner
            ? 'border-sky-200 bg-sky-50 text-neutral-900'
            : 'border-neutral-200 bg-white text-neutral-500'
        }`}
      >
        {patientBanner ?? t.noPatient}
      </section>
      {/* Session strip: time, active procedure, tooth and running material cost. */}
      <section
        aria-label="Session"
        className={`border-b px-4 py-2 text-sm ${
          sessionStrip
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-neutral-200 bg-neutral-100 text-neutral-500'
        }`}
      >
        {sessionStrip ?? t.noSession}
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
