import type { CampaignState } from '../types';
import { formatClock, timePhase } from '../game/clock';
import { noiseLabel } from '../game/labels';
import { MAX_NOISE, isDown } from '../game/rules';
import { Meter } from './Meter';

const DANGER_LABELS = ['', 'Calm', 'Uneasy', 'Dangerous', 'Deadly', 'Overrun'] as const;

function lootHint(remaining: number, initial: number): string {
  if (initial === 0) return 'Nothing worth searching for';
  if (remaining <= 0) return 'Picked clean';
  const ratio = remaining / initial;
  if (ratio > 0.66) return 'Barely searched';
  if (ratio > 0.33) return 'Partly searched';
  return 'Mostly picked over';
}

interface LocationPanelProps {
  state: CampaignState;
  /** Clicking an exit pre-fills the action box. */
  onPickExit: (locationName: string) => void;
}

export function LocationPanel({ state, onPickExit }: LocationPanelProps) {
  const location = state.locations[state.locationId];
  const standing = state.partyOrder.filter((id) => !isDown(state.characters[id])).length;
  const total = state.partyOrder.length;

  return (
    <section aria-label="Location and campaign status" className="rounded-xl border border-ink-600 bg-ink-900 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-bone-400">Current location</h2>
      <h3 className="mt-1 font-story text-xl text-bone-100">{location.name}</h3>
      <p className="mt-1 text-sm leading-snug text-bone-300">{location.description}</p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-bone-400">Danger</dt>
        <dd className="flex items-center gap-2 text-bone-100">
          <span aria-hidden="true" className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`h-2 w-3.5 rounded-sm ${n <= location.dangerLevel ? 'bg-blood-400' : 'bg-ink-600'}`}
              />
            ))}
          </span>
          {DANGER_LABELS[location.dangerLevel]} ({location.dangerLevel}/5)
        </dd>
        <dt className="text-bone-400">Supplies</dt>
        <dd className="text-bone-100">{lootHint(location.lootRemaining, location.lootInitial)}</dd>
      </dl>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-bone-400">Exits</h4>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {location.exits.map((id) => {
          const exit = state.locations[id];
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onPickExit(exit.name)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2.5 py-1 text-xs text-bone-200 hover:border-toxic-500/60 hover:text-bone-100"
                title={`${exit.name}: danger ${exit.dangerLevel}/5`}
              >
                {exit.name}
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-bone-400">Campaign status</h2>
      <p className="mt-1 text-sm text-bone-100">
        {formatClock(state.clock)} <span className="text-bone-400">· {timePhase(state.clock)}</span>
      </p>
      <p className="mt-0.5 text-sm text-bone-300">
        Survivors standing: <strong className="text-bone-100">{standing}</strong>/{total}
      </p>
      <div className="mt-3">
        <Meter label={`Noise: ${noiseLabel(state.noise)}`} current={state.noise} max={MAX_NOISE} tone="noise" />
      </div>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-bone-400">Objectives</h4>
      <ul className="mt-1.5 space-y-1 text-sm">
        {state.objectives.map((o) => (
          <li key={o.id} className="flex gap-2 text-bone-200">
            <span aria-hidden="true" className="text-bone-400">
              {o.status === 'complete' ? '☑' : '☐'}
            </span>
            <span className={o.status === 'complete' ? 'line-through opacity-60' : ''}>{o.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
