import type { Character, GameEvent, PlayerId } from '../types';
import { formatTime } from '../game/clock';
import { OUTCOME_LABELS, SKILL_LABELS, signed } from '../game/labels';

interface EventLogProps {
  events: readonly GameEvent[];
  characters: Record<PlayerId, Character>;
}

/** One terse line per event. Story prose is left to the feed. */
function describe(event: GameEvent, characters: Record<PlayerId, Character>): { text: string; tone: string } | null {
  const name = (id: PlayerId) => characters[id]?.name.split(' ')[0] ?? 'Someone';
  switch (event.kind) {
    case 'player_action':
      return { text: `${name(event.playerId)}: “${event.text}”`, tone: 'text-toxic-300' };
    case 'check': {
      const c = event.check;
      return {
        text: `${name(event.playerId)} rolls ${SKILL_LABELS[c.skill]}: ${c.roll} ${signed(c.modifier)} = ${c.total} vs DC ${c.dc} — ${OUTCOME_LABELS[c.outcome]}`,
        tone: c.outcome.endsWith('success') ? 'text-toxic-300' : 'text-blood-300',
      };
    }
    case 'effect':
      return { text: event.summary, tone: 'text-bone-200' };
    case 'system':
      return { text: event.text, tone: 'text-bone-400 italic' };
    case 'narration':
      return null;
  }
}

export function EventLog({ events, characters }: EventLogProps) {
  const rows = events
    .map((e) => ({ e, d: describe(e, characters) }))
    .filter((r): r is { e: GameEvent; d: { text: string; tone: string } } => r.d !== null)
    .reverse(); // newest first

  return (
    <section
      aria-label="Campaign event log"
      className="flex min-h-0 flex-col rounded-xl border border-ink-600 bg-ink-900"
    >
      <h2 className="border-b border-ink-700 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-bone-400">
        Event log <span className="font-normal normal-case">(newest first)</span>
      </h2>
      <ol className="max-h-72 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3 text-[13px] leading-snug xl:max-h-none">
        {rows.map(({ e, d }) => (
          <li key={e.id} className="flex gap-2">
            <time className="w-16 shrink-0 tabular-nums text-bone-400">{formatTime(e.at)}</time>
            <span className={d.tone}>{d.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
