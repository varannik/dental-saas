'use client';

import { useEffect, useState } from 'react';
import { formatElapsed } from '../lib/elapsed';

/** Time since a moment, ticking every second. */

export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <time dateTime={since} className="tabular-nums">
      {formatElapsed(now - new Date(since).getTime())}
    </time>
  );
}
