'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export function PatientForm() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneMobile, setPhoneMobile] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) throw new Error('Sign in required.');
      const body = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneMobile: phoneMobile.trim() || null,
        contactEmail: contactEmail.trim() || null,
      };
      const res = await apiFetch('/api/v1/patients', {
        method: 'POST',
        accessToken,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Create failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patients', 'list'] });
      setFirstName('');
      setLastName('');
      setPhoneMobile('');
      setContactEmail('');
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Quick add patient
      </Button>
    );
  }

  return (
    <form
      className="bg-card border-border flex flex-col gap-3 rounded-lg border p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="text-sm font-medium">New patient</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-first">First name</Label>
          <Input
            id="pf-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            autoComplete="given-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-last">Last name</Label>
          <Input
            id="pf-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            autoComplete="family-name"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-phone">Mobile phone</Label>
          <Input
            id="pf-phone"
            value={phoneMobile}
            onChange={(e) => setPhoneMobile(e.target.value)}
            autoComplete="tel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-email">Email</Label>
          <Input
            id="pf-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
      </div>
      {mutation.isError && <p className="text-destructive text-sm">{mutation.error.message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Create patient'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
