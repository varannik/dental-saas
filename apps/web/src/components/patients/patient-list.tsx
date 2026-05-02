'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { PatientForm } from '@/components/patients/patient-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePatientsList, type PatientListRow } from '@/hooks/use-patients';

function matchesQuery(p: PatientListRow, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  const hay = [p.firstName, p.lastName, p.phoneMobile ?? '', p.contactEmail ?? '']
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

export function PatientList() {
  const router = useRouter();
  const { data = [], isLoading, isError, error } = usePatientsList();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const filtered = useMemo(() => data.filter((p) => matchesQuery(p, query)), [data, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, pageCount - 1);
  const slice = filtered.slice(pageSafe * pageSize, pageSafe * pageSize + pageSize);

  if (isError) {
    return (
      <p className="text-destructive text-sm">
        {error instanceof Error ? error.message : 'Failed to load patients.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name, phone, or email…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          className="max-w-md"
          aria-label="Search patients"
        />
        <PatientForm />
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Email</TableHead>
              <TableHead className="text-right">Last visit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">
                  Loading patients…
                </TableCell>
              </TableRow>
            ) : slice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">
                  No patients match this filter.
                </TableCell>
              </TableRow>
            ) : (
              slice.map((p) => (
                <TableRow
                  key={p.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => router.push(`/patients/${p.id}`)}
                >
                  <TableCell className="font-medium">
                    {p.firstName} {p.lastName}
                  </TableCell>
                  <TableCell className="font-mono hidden text-sm md:table-cell">
                    {p.phoneMobile ?? '—'}
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {p.contactEmail ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-sm">—</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {filtered.length} patient{filtered.length === 1 ? '' : 's'}
          {query ? ' (filtered)' : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageSafe <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span>
            Page {pageSafe + 1} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageSafe >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Row click opens the patient chart. Last visit will map to encounters when that aggregate
        exists.
      </p>
    </div>
  );
}
