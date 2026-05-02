'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export type PatientListRow = {
  id: string;
  firstName: string;
  lastName: string;
  phoneMobile?: string | null;
  contactEmail?: string | null;
};

type PatientsListResponse = {
  patients: PatientListRow[];
  nextCursor?: string | null;
};

async function fetchPatients(accessToken: string | null): Promise<PatientListRow[]> {
  if (!accessToken) {
    return [];
  }
  const res = await apiFetch('/api/v1/patients?limit=50', { accessToken });
  if (res.status === 401) {
    return [];
  }
  if (!res.ok) {
    throw new Error(`Patients request failed (${res.status})`);
  }
  const body = (await res.json()) as PatientsListResponse;
  return body.patients ?? [];
}

export function usePatientsList() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['patients', 'list', accessToken],
    queryFn: () => fetchPatients(accessToken),
    enabled: Boolean(accessToken),
  });
}
