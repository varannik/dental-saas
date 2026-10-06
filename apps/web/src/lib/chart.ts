import { surfacesOf, type ChartEntry, type Surface } from '@dental/contracts';

/**
 * Layout of the five-area tooth diagram, as clinicians draw it from the front: the patient's
 * right is on the viewer's left. Mesial faces the midline, so it is on the right for teeth in
 * quadrants 1 and 4 and on the left for quadrants 2 and 3. Buccal faces outwards: up for upper
 * teeth, down for lower teeth. The centre is occlusal, or incisal for front teeth.
 */

export type Area = 'top' | 'bottom' | 'left' | 'right' | 'center';

export function surfaceLayout(tooth: string): Record<Area, Surface> {
  const quadrant = Number(tooth[0]);
  const upper = quadrant === 1 || quadrant === 2 || quadrant === 5 || quadrant === 6;
  const patientRight = quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8;
  const center = surfacesOf(tooth).includes('O') ? 'O' : 'I';
  return {
    top: upper ? 'B' : 'L',
    bottom: upper ? 'L' : 'B',
    left: patientRight ? 'D' : 'M',
    right: patientRight ? 'M' : 'D',
    center,
  };
}

export interface ToothView {
  /** The whole-tooth state, such as missing or crown. */
  tooth: string | null;
  surfaces: Partial<Record<Surface, string>>;
}

/** The chart entries of one tooth, split into its whole-tooth state and surface states. */
export function toothView(entries: ChartEntry[], tooth: string): ToothView {
  const view: ToothView = { tooth: null, surfaces: {} };
  for (const entry of entries) {
    if (entry.tooth !== tooth) continue;
    if (entry.surface === null) view.tooth = entry.state;
    else view.surfaces[entry.surface] = entry.state;
  }
  return view;
}

/** Fill colours per surface state; the legend uses the same map. */
export const STATE_COLORS: Record<string, string> = {
  caries: '#dc2626',
  restoration: '#2563eb',
  fracture: '#ea580c',
  watch: '#ca8a04',
};

/** A short spoken-style summary of a tooth, used as its accessible name. */
export function describeTooth(
  tooth: string,
  view: ToothView,
  codeName: (code: string) => string
): string {
  const parts = [`Tooth ${tooth}`];
  if (view.tooth) parts.push(codeName(view.tooth));
  for (const [surface, state] of Object.entries(view.surfaces)) {
    parts.push(`${codeName(state)} ${surface}`);
  }
  return parts.join(', ');
}
