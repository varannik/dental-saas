'use client';

import type { ActivityEntry } from '@dental/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, COMMAND_EVENT } from '../lib/api';
import { useSession } from '../lib/session';
import messages from '../messages/en.json';

/**
 * The activity rail (spec section K): the signed-in user's last ten executed commands, newest
 * first, refreshed after every command. Undo arrives with the voice layer (V6).
 */

const t = messages.activity;
const STORAGE_KEY = 'dental.activityRail';

function readOpen() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'closed';
  } catch {
    return true;
  }
}

export function ActivityRail() {
  const { authed } = useSession();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => setOpen(readOpen()), []);

  const load = useCallback(() => {
    void authed((token) => api.activity(token))
      .then((result) => setEntries(result.entries))
      .catch(() => setEntries([]));
  }, [authed]);

  useEffect(() => {
    load();
    window.addEventListener(COMMAND_EVENT, load);
    return () => window.removeEventListener(COMMAND_EVENT, load);
  }, [load]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed');
    } catch {
      // Remembering the choice is a convenience only.
    }
  }

  return (
    <aside
      aria-label={t.title}
      className={`border-neutral-200 bg-white lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:border-l ${
        open ? 'lg:w-72' : 'lg:w-14'
      } border-t lg:border-t-0`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        {open && <h2 className="font-semibold">{t.title}</h2>}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t.hide : t.show}
          title={open ? t.hide : t.show}
          className="flex size-11 items-center justify-center rounded-lg border border-neutral-300 text-lg hover:bg-neutral-50"
        >
          {open ? '›' : '‹'}
        </button>
      </div>
      {open && (
        <ol className="flex flex-col gap-1 px-3 pb-4">
          {entries === null ? (
            <li className="text-sm text-neutral-500">{messages.shell.loading}</li>
          ) : entries.length === 0 ? (
            <li className="text-sm text-neutral-500">{t.none}</li>
          ) : (
            entries.map((entry) => <Entry key={entry.id} entry={entry} />)
          )}
        </ol>
      )}
    </aside>
  );
}

function Entry({ entry }: { entry: ActivityEntry }) {
  const label = t.types[entry.type as keyof typeof t.types] ?? entry.type;
  const href = entry.sessionId
    ? `/sessions/${entry.sessionId}`
    : entry.patientId
      ? `/patients/${entry.patientId}`
      : null;
  const body = (
    <>
      <span className="block font-medium">{label}</span>
      <span className="block text-xs text-neutral-500">
        {new Date(entry.at).toLocaleTimeString('en-GB', { timeStyle: 'short' })}
        {entry.tooth && ` · ${t.tooth.replace('{tooth}', entry.tooth)}`}
        {entry.source === 'voice' && ` · ${t.voice}`}
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="block min-h-11 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-100"
        >
          {body}
        </Link>
      ) : (
        <div className="min-h-11 px-2 py-1.5 text-sm">{body}</div>
      )}
    </li>
  );
}
