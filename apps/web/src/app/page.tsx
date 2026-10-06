'use client';

import type { MeResponse } from '@dental/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppFrame } from '../components/app-frame';
import { RequireSession } from '../components/require-session';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';

const t = messages.shell;

export default function HomePage() {
  return (
    <RequireSession>
      <AppFrame>
        <Dashboard />
      </AppFrame>
    </RequireSession>
  );
}

function Dashboard() {
  const { authed } = useSession();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    authed((token) => api.me(token))
      .then((result) => active && setMe(result))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [authed]);

  if (!me) return <p className="text-neutral-500">{t.loading}</p>;

  const settings: [string, string][] = [
    [t.country, me.clinic.country],
    [t.currency, me.clinic.currency],
    [t.timezone, me.clinic.timezone],
    [t.language, me.clinic.defaultLocale],
    [t.toothNotation, me.clinic.toothNotation],
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">
          {t.welcome}, {me.user.email}
        </h1>
        <p className="text-neutral-600">{t.comingSoon}</p>
        {me.permissions.includes('patient.read') && (
          <Link
            href="/patients"
            className="mt-3 flex h-12 w-fit items-center rounded-lg bg-neutral-900 px-5 text-lg font-semibold text-white hover:bg-neutral-800"
          >
            {messages.patients.searchLabel}
          </Link>
        )}
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">{t.clinicSettings}</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          {settings.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-neutral-500">{label}</dt>
              <dd className="text-xl font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 text-xl font-semibold">{t.permissions}</h2>
        <p className="mb-4 text-sm text-neutral-500">
          {t.role}: <span className="capitalize">{me.role}</span>
        </p>
        <ul className="flex flex-wrap gap-2">
          {me.permissions.map((permission) => (
            <li
              key={permission}
              className="rounded-full bg-neutral-100 px-3 py-1 font-mono text-sm text-neutral-700"
            >
              {permission}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
