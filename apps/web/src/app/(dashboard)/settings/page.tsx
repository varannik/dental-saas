export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Practice settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tenant-scoped preferences and integrations will live here.
        </p>
      </div>
      <div className="bg-muted/40 border-border rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Foundation placeholder — connect to users/tenant APIs when admin flows are ready.
        </p>
      </div>
    </div>
  );
}
