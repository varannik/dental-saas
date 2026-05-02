'use client';

import type { ChartApiResponse } from '@/hooks/use-dental-chart';

import { ChartLegend } from './chart-legend';
import { Tooth } from './tooth';

/** Universal permanent teeth: upper arch 16→1, lower arch 17→32 (dentist-facing layout). */
const UPPER_ARCH = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
const LOWER_ARCH = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32] as const;

function conditionMap(
  entries: NonNullable<ChartApiResponse['chart']>['entries'] | undefined
): Map<string, string> {
  const m = new Map<string, string>();
  if (!entries) return m;
  for (const e of entries) {
    m.set(e.toothNumber, e.condition);
  }
  return m;
}

type ChartViewProps = {
  patientId: string;
  chart: ChartApiResponse['chart'] | null | undefined;
  isLoading: boolean;
};

export function ChartView({ patientId, chart, isLoading }: ChartViewProps) {
  const byTooth = conditionMap(chart?.entries);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading chart…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border-border overflow-x-auto rounded-xl border p-4 shadow-sm">
        <div
          className="mx-auto flex min-w-[32rem] flex-col gap-3"
          role="img"
          aria-label={`Dental chart for patient ${patientId}`}
        >
          <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
            {UPPER_ARCH.map((n) => (
              <Tooth key={n} number={n} condition={byTooth.get(String(n)) ?? null} />
            ))}
          </div>
          <div className="border-border border-t pt-3">
            <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
              {LOWER_ARCH.map((n) => (
                <Tooth key={n} number={n} condition={byTooth.get(String(n)) ?? null} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <ChartLegend />
      {!chart?.entries?.length && (
        <p className="text-muted-foreground text-xs">
          No chart entries yet — teeth render as healthy until the clinical service returns
          conditions.
        </p>
      )}
    </div>
  );
}
