import type { CheckOutcome, CheckResult } from '../types';
import { OUTCOME_LABELS, SKILL_LABELS, DIFFICULTY_LABELS, signed } from '../game/labels';

const OUTCOME_STYLE: Record<CheckOutcome, { badge: string; die: string; icon: string }> = {
  critical_success: {
    badge: 'bg-toxic-900 text-toxic-300 border-toxic-500',
    die: 'border-toxic-400 text-toxic-300',
    icon: '★',
  },
  success: {
    badge: 'bg-toxic-900 text-toxic-300 border-toxic-500/60',
    die: 'border-toxic-500/70 text-toxic-300',
    icon: '✓',
  },
  failure: {
    badge: 'bg-blood-900 text-blood-300 border-blood-500/60',
    die: 'border-blood-500/70 text-blood-300',
    icon: '✗',
  },
  critical_failure: {
    badge: 'bg-blood-900 text-blood-300 border-blood-400',
    die: 'border-blood-400 text-blood-300',
    icon: '☠',
  },
};

interface DiceResultProps {
  check: CheckResult;
  actorName: string;
}

/** Shows every number that went into a roll, so nothing about a result is hidden. */
export function DiceResult({ check, actorName }: DiceResultProps) {
  const style = OUTCOME_STYLE[check.outcome];
  const noiseDc = check.dc - check.baseDc;
  const skill = SKILL_LABELS[check.skill];

  const parts = [`d20 ${check.roll}`, `${signed(check.skillModifier)} ${skill}`];
  if (check.itemBonus !== 0) parts.push(`${signed(check.itemBonus)} item`);
  if (check.fatiguePenalty !== 0) parts.push(`${signed(check.fatiguePenalty)} exhausted`);

  const dcText = noiseDc > 0 ? `DC ${check.dc} (${check.baseDc} + ${noiseDc} noise)` : `DC ${check.dc}`;
  const spoken = `${actorName} rolled ${check.roll} on a d20 for ${skill}, total ${check.total} against ${dcText}: ${OUTCOME_LABELS[check.outcome]}.`;

  return (
    <div
      className="flex items-center gap-4 rounded-lg border border-ink-500 bg-ink-800 p-3"
      aria-label={spoken}
    >
      <div
        aria-hidden="true"
        className={`animate-dice flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 bg-ink-900 text-2xl font-bold tabular-nums ${style.die}`}
      >
        {check.roll}
      </div>
      <div className="min-w-0 flex-1" aria-hidden="true">
        <div className="text-xs uppercase tracking-wide text-bone-400">
          {actorName} · {skill} · {DIFFICULTY_LABELS[check.difficulty]}
        </div>
        <div className="mt-0.5 text-sm text-bone-200">
          {parts.join(' ')} = <strong className="text-bone-100">{check.total}</strong>{' '}
          <span className="text-bone-400">vs {dcText}</span>
        </div>
        <span
          className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.badge}`}
        >
          <span>{style.icon}</span> {OUTCOME_LABELS[check.outcome]}
          <span className="font-normal opacity-80">
            ({check.margin >= 0 ? '+' : '−'}
            {Math.abs(check.margin)})
          </span>
        </span>
      </div>
    </div>
  );
}
