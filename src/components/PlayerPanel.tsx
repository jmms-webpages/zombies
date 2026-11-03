import type { Character } from '../types';
import { SKILL_IDS } from '../types';
import { bestItemBonus } from '../game/items';
import { SKILL_LABELS, signed } from '../game/labels';
import { isDown } from '../game/rules';
import { Meter } from './Meter';

interface PlayerPanelProps {
  character: Character;
  isYou: boolean;
}

function Badge({ children, tone }: { children: string; tone: 'red' | 'amber' | 'green' }) {
  const style =
    tone === 'red'
      ? 'border-blood-500/60 bg-blood-900 text-blood-300'
      : tone === 'amber'
        ? 'border-ember-400/50 bg-ember-900 text-ember-300'
        : 'border-toxic-500/50 bg-toxic-900 text-toxic-300';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style}`}>
      {children}
    </span>
  );
}

export function PlayerPanel({ character, isYou }: PlayerPanelProps) {
  const down = isDown(character);
  const exhausted = character.stamina.current <= 0;
  const wounded = !down && character.health.current <= character.health.max * 0.3;

  return (
    <article
      aria-label={`${character.name}, survivor`}
      className={`rounded-xl border p-4 ${
        isYou ? 'border-toxic-500/60 bg-ink-800' : 'border-ink-600 bg-ink-900'
      } ${down ? 'opacity-70' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-bone-100">{character.name}</h3>
        {isYou && <Badge tone="green">You</Badge>}
        {down && <Badge tone="red">Down</Badge>}
        {wounded && <Badge tone="red">Badly hurt</Badge>}
        {exhausted && !down && <Badge tone="amber">Exhausted</Badge>}
      </header>
      <p className="mt-1 text-sm leading-snug text-bone-400">{character.background}</p>

      <div className="mt-3 grid gap-2.5">
        <Meter label="Health" current={character.health.current} max={character.health.max} tone="health" />
        <Meter label="Stamina" current={character.stamina.current} max={character.stamina.max} tone="stamina" />
      </div>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-bone-400">Skills</h4>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {SKILL_IDS.map((id) => {
          const base = character.skills[id];
          const item = bestItemBonus(character.inventory, id);
          return (
            <li
              key={id}
              className="flex items-baseline justify-between border-b border-ink-700 py-0.5"
              title={item ? `Base ${signed(base)}, item ${signed(item)}` : undefined}
            >
              <span className="text-bone-300">{SKILL_LABELS[id]}</span>
              <span
                className={`tabular-nums font-semibold ${
                  base + item > 0 ? 'text-toxic-300' : base + item < 0 ? 'text-blood-300' : 'text-bone-400'
                }`}
              >
                {signed(base + item)}
                {item > 0 && <span className="ml-0.5 text-[10px] font-normal text-ember-300">gear</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-bone-400">Inventory</h4>
      {character.inventory.length === 0 ? (
        <p className="mt-1 text-sm italic text-bone-400">Nothing but lint.</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-sm">
          {character.inventory.map((item) => (
            <li key={item.templateId} className="flex items-baseline justify-between gap-2" title={item.description}>
              <span className="text-bone-200">
                {item.name}
                {item.quantity > 1 && <span className="text-bone-400"> ×{item.quantity}</span>}
              </span>
              {item.bonus && (
                <span className="shrink-0 text-xs text-ember-300">
                  {signed(item.bonus.value)} {SKILL_LABELS[item.bonus.skill]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
