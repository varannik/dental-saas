import Link from 'next/link';

import { ChartSection } from '@/components/dental-chart/chart-section';
import { PatientCard } from '@/components/patients/patient-card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SAMPLE_ENCOUNTER_ID } from '@/lib/constants';

type PageProps = { params: Promise<{ id: string }> };

export default async function PatientDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PatientCard patientId={id} />
        <Link
          href={`/patients/${id}/encounters/${SAMPLE_ENCOUNTER_ID}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          Open encounter (sample id)
        </Link>
      </div>
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Dental chart</h2>
        <p className="text-muted-foreground text-sm">
          Odontogram is driven by chart entries from{' '}
          <code className="font-mono text-xs">GET /api/v1/patients/:id/chart</code>.
        </p>
        <ChartSection patientId={id} />
      </section>
      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">Clinical notes</h2>
        <p className="text-muted-foreground text-sm">
          Notes and AI capture will connect here; this block is a layout stub.
        </p>
        <div className="bg-muted/40 border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          No note editor in this foundation slice.
        </div>
      </section>
    </div>
  );
}
