'use client';

import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePatient } from '@/hooks/use-patient';

type PatientCardProps = {
  patientId: string;
};

export function PatientCard({ patientId }: PatientCardProps) {
  const { data, isLoading, isError, error } = usePatient(patientId);

  if (isLoading) {
    return (
      <Card className="max-w-md shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Loading…</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/50 max-w-md shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Patient unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : 'Could not load this patient.'}
        </CardContent>
      </Card>
    );
  }

  const name = `${data.firstName} ${data.lastName}`.trim();

  return (
    <Card className="max-w-md shadow-sm">
      <CardHeader>
        <CardTitle className="font-heading text-xl">{name}</CardTitle>
      </CardHeader>
      <CardContent className="font-mono text-sm">
        <dl className="grid gap-2">
          {data.phoneMobile && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Phone</dt>
              <dd>{data.phoneMobile}</dd>
            </div>
          )}
          {data.contactEmail && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Email</dt>
              <dd className="break-all">{data.contactEmail}</dd>
            </div>
          )}
          {data.dob && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">DOB</dt>
              <dd>{data.dob}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-24 shrink-0">Id</dt>
            <dd className="break-all">{data.id}</dd>
          </div>
        </dl>
        <Link href="/patients" className="text-primary mt-4 inline-block text-sm font-medium">
          ← All patients
        </Link>
      </CardContent>
    </Card>
  );
}
