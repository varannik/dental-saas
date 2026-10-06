'use client';

import { PERMANENT_TEETH, type ChartEntry } from '@dental/contracts';
import { describeTooth, STATE_COLORS, surfaceLayout, toothView, type Area } from '../lib/chart';
import messages from '../messages/en.json';

/**
 * The permanent dentition as five-area tooth diagrams, upper arch above lower, from the
 * clinician's view. Surfaces are coloured by state; whole-tooth states show as a short label.
 */

const t = messages.sessions;

const AREAS: Record<Area, string> = {
  top: '8,8 48,8 36,20 20,20',
  bottom: '8,48 48,48 36,36 20,36',
  left: '8,8 20,20 20,36 8,48',
  right: '48,8 48,48 36,36 36,20',
  center: '20,20 36,20 36,36 20,36',
};

const TOOTH_LABELS: Record<string, string> = {
  missing: 'X',
  crown: 'Cr',
  root_canal_treated: 'RCT',
  implant: 'Imp',
  impacted: 'Imc',
  mobility: 'Mob',
  fracture: 'Fx',
  watch: 'W',
};

const codeName = (code: string) => t.codes[code as keyof typeof t.codes] ?? code;

export function ToothChart({
  entries,
  selected,
  onSelect,
}: {
  entries: ChartEntry[];
  selected?: string | null;
  onSelect?: (tooth: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <div className="flex justify-between text-xs uppercase tracking-wide text-neutral-500">
        <span>{t.patientRight}</span>
        <span>{t.patientLeft}</span>
      </div>
      <Arch teeth={PERMANENT_TEETH.upper} upper {...{ entries, selected, onSelect }} />
      <Arch teeth={PERMANENT_TEETH.lower} upper={false} {...{ entries, selected, onSelect }} />
      <Legend />
    </div>
  );
}

function Arch({
  teeth,
  upper,
  entries,
  selected,
  onSelect,
}: {
  teeth: readonly string[];
  upper: boolean;
  entries: ChartEntry[];
  selected?: string | null;
  onSelect?: (tooth: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={upper ? t.upper : t.lower}
      className="flex min-w-max justify-center gap-0.5"
    >
      {teeth.map((tooth, index) => (
        <div key={tooth} className={`flex ${index === 8 ? 'ml-3' : ''}`}>
          <Tooth
            tooth={tooth}
            upper={upper}
            entries={entries}
            selected={selected === tooth}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  );
}

function Tooth({
  tooth,
  upper,
  entries,
  selected,
  onSelect,
}: {
  tooth: string;
  upper: boolean;
  entries: ChartEntry[];
  selected: boolean;
  onSelect?: (tooth: string) => void;
}) {
  const view = toothView(entries, tooth);
  const layout = surfaceLayout(tooth);
  const missing = view.tooth === 'missing';
  const label = view.tooth ? TOOTH_LABELS[view.tooth] : undefined;
  const number = <span className="text-xs font-medium text-neutral-600">{tooth}</span>;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tooth)}
      disabled={!onSelect}
      aria-pressed={selected}
      aria-label={describeTooth(tooth, view, codeName)}
      className={`flex flex-col items-center rounded-md px-0.5 py-1 ${
        selected ? 'bg-sky-100 ring-2 ring-sky-600' : onSelect ? 'hover:bg-neutral-100' : ''
      }`}
    >
      {upper && number}
      <svg width="44" height="44" viewBox="4 4 48 48" aria-hidden="true">
        {(Object.keys(AREAS) as Area[]).map((area) => {
          const state = view.surfaces[layout[area]];
          return (
            <polygon
              key={area}
              points={AREAS[area]}
              fill={missing ? '#e5e5e5' : state ? (STATE_COLORS[state] ?? '#a3a3a3') : '#ffffff'}
              stroke="#737373"
              strokeWidth="1"
            />
          );
        })}
        {missing && <path d="M10 10 L46 46 M46 10 L10 46" stroke="#525252" strokeWidth="2.5" />}
        {view.tooth === 'crown' && (
          <rect
            x="6"
            y="6"
            width="44"
            height="44"
            rx="4"
            fill="none"
            stroke="#d97706"
            strokeWidth="3"
          />
        )}
      </svg>
      <span className="h-4 text-[11px] font-semibold leading-4 text-neutral-800">
        {label && !missing ? label : ''}
      </span>
      {!upper && number}
    </button>
  );
}

function Legend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
      {Object.entries(STATE_COLORS).map(([state, color]) => (
        <li key={state} className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: color }} />
          {codeName(state)}
        </li>
      ))}
      {Object.entries(TOOTH_LABELS)
        .filter(([state]) => !(state in STATE_COLORS))
        .map(([state, short]) => (
          <li key={state}>
            <span className="font-semibold">{short}</span> {codeName(state)}
          </li>
        ))}
    </ul>
  );
}
