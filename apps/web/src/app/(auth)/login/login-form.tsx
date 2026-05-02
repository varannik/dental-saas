'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLayoutEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEMO_TENANT_ID } from '@/lib/constants';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const nextPath = searchParams.get('next') || '/dashboard';

  useLayoutEffect(() => {
    if (accessToken) {
      router.replace(nextPath.startsWith('/') ? nextPath : '/dashboard');
    }
  }, [accessToken, router, nextPath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          tenantId: DEMO_TENANT_ID,
        }),
      });
      if (!res.ok) {
        let msg = `Login failed (${res.status})`;
        const text = await res.text();
        try {
          const body = JSON.parse(text) as { error?: string; message?: string };
          if (typeof body.error === 'string') msg = body.error;
          else if (typeof body.message === 'string') msg = body.message;
        } catch {
          if (text) msg = text.slice(0, 200);
        }
        setError(msg);
        return;
      }
      const body = (await res.json()) as { accessToken?: string };
      if (!body.accessToken) {
        setError('Invalid response from server.');
        return;
      }
      setSession(body.accessToken, DEMO_TENANT_ID);
      router.replace(nextPath.startsWith('/') ? nextPath : '/dashboard');
    } catch {
      setError('Network error. Is the API gateway running?');
    } finally {
      setPending(false);
    }
  }

  if (accessToken) {
    return <p className="text-muted-foreground text-sm">Redirecting…</p>;
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        No account?{' '}
        <Link
          href="/register"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Register
        </Link>
      </p>
    </form>
  );
}
