'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';

import { VoiceIndicator } from '@/components/voice/voice-indicator';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEncounterStore } from '@/stores/encounter.store';

export default function EncounterDetailPage() {
  const params = useParams();
  const encId = typeof params.encId === 'string' ? params.encId : '';
  const patientId = typeof params.id === 'string' ? params.id : '';
  const setActiveEncounter = useEncounterStore((s) => s.setActiveEncounter);
  const clearActiveEncounter = useEncounterStore((s) => s.clearActiveEncounter);

  useEffect(() => {
    if (patientId && encId) {
      setActiveEncounter(patientId, encId);
    }
    return () => clearActiveEncounter();
  }, [encId, patientId, setActiveEncounter, clearActiveEncounter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Encounter</h1>
          <p className="text-muted-foreground font-mono mt-1 text-xs break-all">
            patient {patientId} · encounter {encId}
          </p>
        </div>
        <Link
          href={patientId ? `/patients/${patientId}` : '/patients'}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          Back to patient
        </Link>
      </div>
      <VoiceIndicator />
      <p className="text-muted-foreground text-sm leading-relaxed">
        Wire this view to <code className="font-mono text-xs">GET /api/v1/encounters/:id</code> and
        voice streams when the clinical API stabilizes. The encounter id above is whatever you
        navigated with — replace with a real UUID from the backend.
      </p>
    </div>
  );
}
