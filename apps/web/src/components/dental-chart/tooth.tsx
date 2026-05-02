'use client';

import { cn } from '@/lib/utils';

const CONDITION_STYLES: Record<string, { fill: string; label: string }> = {
  HEALTHY: { fill: 'fill-slate-50 stroke-slate-400', label: 'Healthy' },
  CARIES: { fill: 'fill-red-500 stroke-red-700', label: 'Caries' },
  FILLING: { fill: 'fill-sky-500 stroke-sky-800', label: 'Filling' },
  MISSING: { fill: 'fill-slate-400 stroke-slate-600', label: 'Missing' },
  CROWN: { fill: 'fill-amber-200 stroke-amber-700', label: 'Crown' },
  IMPLANT: { fill: 'fill-violet-300 stroke-violet-800', label: 'Implant' },
  ROOT_CANAL: { fill: 'fill-orange-200 stroke-orange-700', label: 'Root canal' },
  SEALANT: { fill: 'fill-cyan-200 stroke-cyan-700', label: 'Sealant' },
  BRIDGE: { fill: 'fill-amber-100 stroke-amber-800', label: 'Bridge' },
  VENEER: { fill: 'fill-yellow-100 stroke-yellow-700', label: 'Veneer' },
  FRACTURE: { fill: 'fill-rose-300 stroke-rose-900', label: 'Fracture' },
  OTHER: { fill: 'fill-slate-200 stroke-slate-500', label: 'Other' },
};

type ToothProps = {
  number: number;
  condition: string | null;
};

export function Tooth({ number, condition }: ToothProps) {
  const key = condition && CONDITION_STYLES[condition] ? condition : 'HEALTHY';
  const styles = CONDITION_STYLES[key] ?? CONDITION_STYLES.OTHER;

  const title = `${number}: ${styles.label}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 40 48" className="size-8 shrink-0 sm:size-9" role="img" aria-label={title}>
        <title>{title}</title>
        <rect
          x="4"
          y="6"
          width="32"
          height="36"
          rx="6"
          className={cn('stroke-2 transition-colors', styles.fill)}
        />
      </svg>
      <span className="text-muted-foreground font-mono text-[10px] leading-none">{number}</span>
    </div>
  );
}
