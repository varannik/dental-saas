export function ChartLegend() {
  const items = [
    { className: 'bg-white ring-slate-300 border', label: 'Healthy' },
    { className: 'bg-red-500', label: 'Caries' },
    { className: 'bg-sky-500', label: 'Filling' },
    { className: 'bg-slate-400', label: 'Missing' },
  ];
  return (
    <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2">
          <span className={`ring-border size-4 rounded-sm ring-1 ${i.className}`} />
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  );
}
