import type { FormEvent, KeyboardEvent } from 'react';
import { MAX_ACTION_LENGTH } from '../game/engine';

interface ActionFormProps {
  playerName: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  /** Quick actions the player can click to fill the box. */
  suggestions: string[];
  /** When set, the box is locked and this is shown as the reason. */
  lockedReason?: string;
  busy: boolean;
}

export function ActionForm({
  playerName,
  value,
  onChange,
  onSubmit,
  suggestions,
  lockedReason,
  busy,
}: ActionFormProps) {
  const locked = Boolean(lockedReason);
  const canSend = !locked && value.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onSubmit(value);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  // Enter sends, Shift+Enter adds a line break.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-ink-600 bg-ink-900/80 p-3 sm:p-4">
      {suggestions.length > 0 && !locked && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Quick actions">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="rounded-full border border-ink-500 bg-ink-800 px-3 py-1 text-xs text-bone-300 hover:border-toxic-500/60 hover:text-bone-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <label htmlFor="action-input" className="sr-only">
        What does {playerName} do?
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="action-input"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_ACTION_LENGTH))}
          onKeyDown={handleKeyDown}
          disabled={locked}
          rows={2}
          maxLength={MAX_ACTION_LENGTH}
          placeholder={lockedReason ?? `What does ${playerName} do?  (Enter to send, Shift+Enter for a new line)`}
          className="min-h-[3.25rem] flex-1 resize-none rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-[0.95rem] text-bone-100 placeholder:text-bone-400 focus:border-toxic-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-[3.25rem] rounded-lg bg-toxic-500 px-5 text-sm font-semibold text-ink-950 hover:bg-toxic-400 disabled:cursor-not-allowed disabled:bg-ink-600 disabled:text-bone-400"
        >
          {busy ? 'Queue' : 'Act'}
        </button>
      </div>
      <div className="mt-1 flex justify-between text-xs text-bone-400">
        <span>{lockedReason ?? ''}</span>
        <span className="tabular-nums">
          {value.length}/{MAX_ACTION_LENGTH}
        </span>
      </div>
    </form>
  );
}
