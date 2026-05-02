'use client';

import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  patients: 'Patients',
  encounters: 'Encounters',
  settings: 'Settings',
  login: 'Login',
  register: 'Register',
  schedule: 'Schedule',
  reports: 'Reports',
};

function segmentLabel(segment: string): string {
  if (/^[0-9a-f-]{36}$/i.test(segment)) {
    return 'Record';
  }
  return LABELS[segment] ?? segment.replace(/-/g, ' ');
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const raw = pathname.split('/').filter(Boolean);
  const segments = raw[0] === 'dashboard' ? raw.slice(1) : raw;
  const prefix = raw[0] === 'dashboard' ? '/dashboard' : '';

  if (raw.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm"
    >
      <Link
        href="/dashboard"
        className="hover:text-foreground inline-flex items-center gap-1 font-medium"
      >
        <Home className="size-3.5" aria-hidden />
        Dashboard
      </Link>
      {segments.map((segment, index) => {
        const href = prefix + (prefix ? '/' : '/') + segments.slice(0, index + 1).join('/');
        const normalizedHref = href.replace('//', '/');
        const isLast = index === segments.length - 1;
        const label = segmentLabel(segment);
        return (
          <span key={normalizedHref} className="flex items-center gap-1">
            <ChevronRight className="text-muted-foreground/70 size-3.5 shrink-0" aria-hidden />
            {isLast ? (
              <span className="text-foreground font-medium">{label}</span>
            ) : (
              <Link href={normalizedHref} className="hover:text-foreground">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
