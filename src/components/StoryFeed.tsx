import { useEffect, useRef } from 'react';
import type { Character, GameEvent, PlayerId } from '../types';
import { formatClock } from '../game/clock';
import { DiceResult } from './DiceResult';

interface StoryFeedProps {
  events: readonly GameEvent[];
  characters: Record<PlayerId, Character>;
  /** True while the Game Master is working on an action. */
  thinking: boolean;
}

/** Only these event kinds belong in the story; the rest live in the event log. */
function isStoryEvent(e: GameEvent): boolean {
  return e.kind === 'narration' || e.kind === 'player_action' || e.kind === 'check';
}

export function StoryFeed({ events, characters, thinking }: StoryFeedProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const story = events.filter(isStoryEvent);

  // Keep the newest entry in view.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [story.length, thinking]);

  return (
    <div
      ref={scroller}
      role="log"
      aria-live="polite"
      aria-label="Story"
      tabIndex={0}
      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
    >
      {story.map((event) => {
        switch (event.kind) {
          case 'narration':
            return (
              <p
                key={event.id}
                className="animate-feed-in font-story text-[1.05rem] leading-relaxed text-bone-100 sm:text-lg"
              >
                {event.text}
              </p>
            );
          case 'player_action': {
            const name = characters[event.playerId]?.name ?? 'Someone';
            return (
              <div key={event.id} className="animate-feed-in border-l-2 border-toxic-500/70 pl-3">
                <div className="text-xs uppercase tracking-wide text-bone-400">
                  {name} · {formatClock(event.at)}
                </div>
                <p className="text-[0.95rem] text-toxic-300">{event.text}</p>
              </div>
            );
          }
          case 'check':
            return (
              <div key={event.id} className="animate-feed-in">
                <DiceResult check={event.check} actorName={characters[event.playerId]?.name ?? 'Someone'} />
              </div>
            );
          default:
            return null;
        }
      })}
      {thinking && (
        <div
          className="animate-thinking flex items-center gap-1 text-bone-400"
          role="status"
          aria-label="The Game Master is thinking"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-bone-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-bone-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-bone-400" />
          <span className="ml-2 text-sm italic">The Game Master considers…</span>
        </div>
      )}
    </div>
  );
}
