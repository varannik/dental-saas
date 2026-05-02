import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function DashboardHomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          You are connected to the API gateway. Open patients to list records from the clinical
          service, or continue building schedule and reports against this shell.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/patients" className={cn(buttonVariants())}>
          View patients
        </Link>
        <Link href="/settings" className={cn(buttonVariants({ variant: 'outline' }))}>
          Practice settings
        </Link>
      </div>
    </div>
  );
}
