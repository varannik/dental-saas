'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { establishSessionFromAccessToken, loginWithPasswordForTenant } from '@/lib/auth-session';
import { apiFetch } from '@/lib/api-client';
import { getStoredLastLoginEmail } from '@/lib/login-email-storage';
import { useAuthStore } from '@/stores/auth.store';

const TENANT_TYPE_OPTIONS = [
  { value: 'SOLO_PRACTICE', label: 'Solo practice' },
  { value: 'GROUP_PRACTICE', label: 'Group practice' },
  { value: 'DSO', label: 'DSO / enterprise' },
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<string>(TENANT_TYPE_OPTIONS[0].value);
  const [password, setPassword] = useState('');
  const [emailOverride, setEmailOverride] = useState('');
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setStoredEmail(getStoredLastLoginEmail());
  }, []);

  const effectiveEmail = (storedEmail ?? emailOverride).trim();

  async function onCreateOrganization(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);
    try {
      const accessToken = useAuthStore.getState().accessToken;
      if (!accessToken) {
        setError('Not signed in.');
        return;
      }
      if (effectiveEmail.length === 0) {
        setError('We need your email to sign you into the new organization. Enter it below.');
        return;
      }
      if (password.length < 8) {
        setError('Enter your password (same as sign-in).');
        return;
      }

      const res = await apiFetch('/api/v1/tenants/with-membership', {
        method: 'POST',
        accessToken,
        body: JSON.stringify({
          name: orgName.trim(),
          type: orgType,
        }),
      });

      if (res.status === 401) {
        setError('Session expired. Sign in again.');
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        let msg = `Could not create organization (${res.status})`;
        try {
          const body = JSON.parse(text) as { error?: string };
          if (typeof body.error === 'string') msg = body.error;
        } catch {
          /* keep msg */
        }
        setError(msg);
        return;
      }

      const body = (await res.json()) as { tenant?: { id: string } };
      const newTenantId = body.tenant?.id;
      if (typeof newTenantId !== 'string') {
        setError('Invalid response from server.');
        return;
      }

      const login = await loginWithPasswordForTenant(effectiveEmail, password, newTenantId);
      if (!login) {
        setError(
          'Organization created but sign-in failed. Try signing in manually and pick the new tenant (future: tenant switcher).'
        );
        setSuccess(`New tenant id: ${newTenantId}`);
        return;
      }

      await establishSessionFromAccessToken(login.accessToken, newTenantId);
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
      setPassword('');
      setOrgName('');
      router.push('/dashboard');
    } catch {
      setError('Network error.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Practice settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tenant-scoped preferences and organization management.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create organization</CardTitle>
          <CardDescription>
            Creates a new tenant in the database and adds you as <strong>ADMIN</strong>. You will be
            signed in under the new organization. Your password is only sent to the auth service for
            a fresh token (same as sign-in).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onCreateOrganization}>
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization name</Label>
              <Input
                id="orgName"
                required
                minLength={2}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Bright Smile Dental"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgType">Organization type</Label>
              <select
                id="orgType"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
              >
                {TENANT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {!storedEmail && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={emailOverride}
                  onChange={(e) => setEmailOverride(e.target.value)}
                  placeholder="you@practice.com"
                />
              </div>
            )}
            {storedEmail && (
              <p className="text-muted-foreground text-sm">
                Signing in as <span className="text-foreground font-medium">{storedEmail}</span>
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="orgPassword">Password</Label>
              <Input
                id="orgPassword"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Confirm with your password"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {success && <p className="text-muted-foreground text-sm">{success}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create organization'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
