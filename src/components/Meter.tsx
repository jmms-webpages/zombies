interface MeterProps {
  label: string;
  current: number;
  max: number;
  tone: 'health' | 'stamina' | 'noise';
}

/** A labelled bar. The number is always shown, so colour is never the only signal. */
export function Meter({ label, current, max, tone }: MeterProps) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const fill =
    tone === 'health'
      ? pct <= 30
        ? 'bg-blood-400'
        : 'bg-toxic-400'
      : tone === 'stamina'
        ? 'bg-ember-400'
        : pct >= 70
          ? 'bg-blood-400'
          : pct >= 40
            ? 'bg-ember-400'
            : 'bg-tide-400';

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-bone-300">
        <span>{label}</span>
        <span className="tabular-nums text-bone-100">
          {current}/{max}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={current}
        className="mt-1 h-2 overflow-hidden rounded-full bg-ink-600"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
