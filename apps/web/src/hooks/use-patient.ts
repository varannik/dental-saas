'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export type PatientDetail = {
  id: string;
  firstName: string;
  lastName: string;
  phoneMobile?: string | null;
  contactEmail?: string | null;
  dob?: string | null;
};

async function fetchPatient(id: string, accessToken: string | null): Promise<PatientDetail | null> {
  if (!accessToken) return null;
  const res = await apiFetch(`/api/v1/patients/${id}`, { accessToken });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`Patient request failed (${res.status})`);
  return (await res.json()) as PatientDetail;
}

export function usePatient(patientId: string) {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['patients', patientId, accessToken],
    queryFn: () => fetchPatient(patientId, accessToken),
    enabled: Boolean(accessToken && patientId),
  });
}
