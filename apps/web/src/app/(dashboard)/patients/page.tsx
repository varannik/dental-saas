import { PatientList } from '@/components/patients/patient-list';

export default function PatientsListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Patients</h1>
        <p className="text-muted-foreground mt-1 text-sm">Search and open patient records.</p>
      </div>
      <PatientList />
    </div>
  );
}
