'use client';

import { Bell, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';

type DashboardHeaderProps = {
  onSignOut: () => void;
  practiceName?: string;
};

export function DashboardHeader({
  onSignOut,
  practiceName = 'Demo practice',
}: DashboardHeaderProps) {
  return (
    <header className="bg-card/80 flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 backdrop-blur-md md:px-6">
      <p className="text-foreground font-heading truncate text-sm font-semibold md:text-base">
        {practiceName}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label="Notifications (coming soon)"
        >
          <Bell className="size-5" />
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onSignOut}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
