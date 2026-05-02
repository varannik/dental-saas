'use client';

import { ChartView } from '@/components/dental-chart/chart-view';
import { useDentalChart } from '@/hooks/use-dental-chart';

type ChartSectionProps = {
  patientId: string;
};

export function ChartSection({ patientId }: ChartSectionProps) {
  const { data, isLoading } = useDentalChart(patientId);
  return <ChartView patientId={patientId} chart={data} isLoading={isLoading} />;
}
