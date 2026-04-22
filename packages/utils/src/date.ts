export function formatEncounterDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
