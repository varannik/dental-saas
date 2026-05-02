'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export type ChartApiResponse = {
  chart?: {
    entries: Array<{
      id: string;
      toothNumber: string;
      condition: string;
      surface?: string | null;
      cdtCode?: string | null;
    }>;
  };
};

async function fetchChart(
  patientId: string,
  accessToken: string | null
): Promise<ChartApiResponse['chart'] | null> {
  if (!accessToken) {
    return null;
  }
  const res = await apiFetch(`/api/v1/patients/${patientId}/chart`, { accessToken });
  if (res.status === 404 || res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Chart request failed (${res.status})`);
  }
  const body = (await res.json()) as ChartApiResponse;
  return body.chart ?? null;
}

export function useDentalChart(patientId: string) {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['patients', patientId, 'chart', accessToken],
    queryFn: () => fetchChart(patientId, accessToken),
    enabled: Boolean(accessToken && patientId),
  });
}
