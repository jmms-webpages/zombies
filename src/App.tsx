import { useCallback, useMemo, useState } from 'react';
import type { GameMaster, PlayerId } from './types';
import { createMockCampaign } from './data/mockCampaign';
import { LocalStorageRepository, type CampaignRepository } from './firebase/repository';
import { createGameMaster } from './gm';
import { isPartyWiped } from './game/engine';
import { isDown } from './game/rules';
import { suggestActions } from './game/suggestions';
import { useCampaign } from './state/useCampaign';
import { ActionForm } from './components/ActionForm';
import { EventLog } from './components/EventLog';
import { LocationPanel } from './components/LocationPanel';
import { PlayerPanel } from './components/PlayerPanel';
import { StoryFeed } from './components/StoryFeed';

const PLAYER_KEY = 'zombie-school-rpg.player';

/** Which survivor this browser controls: `?player=` wins, then the last choice, then the first. */
function initialPlayer(valid: readonly PlayerId[]): PlayerId {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('player');
    if (fromUrl && valid.includes(fromUrl)) return fromUrl;
    const saved = window.localStorage.getItem(PLAYER_KEY);
    if (saved && valid.includes(saved)) return saved;
  } catch {
    // storage or URL access blocked: fall through to the default
  }
  return valid[0];
}

export interface AppProps {
  /** Injectable for tests; defaults to this browser's localStorage. */
  repo?: CampaignRepository;
  gm?: GameMaster;
}

const defaultRepo = new LocalStorageRepository();
const defaultGm = createGameMaster();

export function App({ repo = defaultRepo, gm = defaultGm }: AppProps) {
  const campaign = useCampaign({ gm, repo, createInitial: createMockCampaign });
  const { state, pending, submit, reset } = campaign;

  const [chosen, setChosen] = useState<PlayerId | null>(null);
  const [draft, setDraft] = useState('');

  const playerId = useMemo<PlayerId | null>(() => {
    if (!state) return null;
    if (chosen && state.characters[chosen]) return chosen;
    return initialPlayer(state.partyOrder);
  }, [state, chosen]);

  const choosePlayer = useCallback((id: PlayerId) => {
    setChosen(id);
    try {
      window.localStorage.setItem(PLAYER_KEY, id);
    } catch {
      // not persisted; still works for this session
    }
  }, []);

  if (!state || !playerId) {
    return (
      <div className="grid min-h-screen place-items-center text-bone-300" role="status">
        Loading campaign…
      </div>
    );
  }

  const me = state.characters[playerId];
  const wiped = isPartyWiped(state);
  const lockedReason = wiped
    ? 'The campaign is over. Every survivor is down.'
    : isDown(me)
      ? `${me.name} is down and cannot act.`
      : undefined;

  const onSubmit = (text: string) => {
    setDraft('');
    void submit(playerId, text);
  };

  const onReset = () => {
    if (window.confirm('Start a brand new campaign? This erases the current one for everyone using this browser.')) {
      void reset();
      setDraft('');
    }
  };

  // Your own panel first, so on a phone you see yourself before the others.
  const panelOrder = [playerId, ...state.partyOrder.filter((id) => id !== playerId)];

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-700 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-2 px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <h1 className="font-story text-xl leading-tight text-bone-100 sm:text-2xl">
              <span className="text-blood-400">Zombie School</span> RPG
            </h1>
            <p className="truncate text-xs text-bone-400">
              {state.title} · {gm.name}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-bone-300">
              Playing as
              <select
                value={playerId}
                onChange={(e) => choosePlayer(e.target.value)}
                className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-bone-100 focus:border-toxic-500"
              >
                {state.partyOrder.map((id) => (
                  <option key={id} value={id}>
                    {state.characters[id].name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-ink-500 px-3 py-1.5 text-sm text-bone-300 hover:border-blood-500/70 hover:text-blood-300"
            >
              New campaign
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1800px] gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_22rem_22rem]">
        {/* Story + action box */}
        <section
          aria-label="Story and actions"
          className="flex h-[75vh] min-h-[26rem] flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-900/90 lg:col-start-1 lg:row-start-1 lg:h-[calc(100vh-7.5rem)]"
        >
          <StoryFeed events={state.events} characters={state.characters} thinking={pending > 0} />
          <ActionForm
            playerName={me.name}
            value={draft}
            onChange={setDraft}
            onSubmit={onSubmit}
            suggestions={suggestActions(state, playerId)}
            lockedReason={lockedReason}
            busy={pending > 0}
          />
        </section>

        {/* Location, campaign status, event log */}
        <div className="flex min-h-0 flex-col gap-4 lg:col-start-2 lg:row-start-1 xl:h-[calc(100vh-7.5rem)]">
          <LocationPanel state={state} onPickExit={(name) => setDraft(`Quietly go to the ${name}`)} />
          <EventLog events={state.events} characters={state.characters} />
        </div>

        {/* Three survivors */}
        <section
          aria-label="Survivors"
          className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-3 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:grid-cols-1 xl:content-start xl:overflow-y-auto xl:h-[calc(100vh-7.5rem)]"
        >
          {panelOrder.map((id) => (
            <PlayerPanel key={id} character={state.characters[id]} isYou={id === playerId} />
          ))}
        </section>
      </main>
    </div>
  );
}
