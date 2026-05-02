'use client';

import {
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Settings,
  Stethoscope,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '../ui/button';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: Stethoscope },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'border-sidebar-border bg-sidebar text-sidebar-foreground flex h-screen flex-col border-r transition-[width]',
        collapsed ? 'w-[4.25rem]' : 'w-56 md:w-60'
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b px-3">
        {!collapsed && (
          <span className="text-sidebar-primary truncate text-sm font-semibold">Dental SaaS</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('size-8 shrink-0', collapsed && 'mx-auto')}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Main">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const content = (
            <span
              className={cn(
                'hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
                active && 'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {!collapsed && <span>{item.label}</span>}
            </span>
          );

          return (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
