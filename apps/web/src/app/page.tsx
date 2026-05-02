import { ArrowRight, Stethoscope } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function HomePage() {
  return (
    <div className="from-background to-muted/40 flex min-h-screen flex-col bg-gradient-to-b">
      <header className="border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <Stethoscope className="text-primary size-7" aria-hidden />
            <span>Dental SaaS</span>
          </div>
          <nav className="flex gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: 'ghost' }))}>
              Sign in
            </Link>
            <Link href="/register" className={cn(buttonVariants())}>
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <p className="text-primary text-sm font-medium tracking-wide uppercase">
          Phase 2 — Web foundation
        </p>
        <h1 className="font-heading mt-3 text-4xl font-bold tracking-tight text-balance md:text-5xl">
          Operate your practice with a clinical-grade workspace.
        </h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed text-pretty">
          This shell connects to the API gateway for patients, encounters, charting, and treatment
          planning. Layout, auth flows, and odontogram placeholders follow the dental-core guide —
          swap in production wiring as endpoints harden.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/dashboard" className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
            Open dashboard
            <ArrowRight className="size-4" />
          </Link>
          <Link href="/login" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
