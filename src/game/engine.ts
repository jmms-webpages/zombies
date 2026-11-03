/**
 * The action pipeline. It wires a Game Master to the rules module and is the
 * only code that turns "a player typed something" into a new CampaignState.
 *
 *   player text ─▶ GM.adjudicate (untrusted) ─▶ sanitizeAdjudication
 *               ─▶ resolveAction (rolls dice, picks every number)
 *               ─▶ applyEffect (only way state changes)
 *               ─▶ GM.narrate (text only)
 *
 * No React, no Firebase.
 */
import type {
  CampaignState,
  GameEvent,
  GameMaster,
  GMContext,
  PlayerAction,
  PlayerId,
  Resolution,
} from '../types';
import { formatClock } from './clock';
import { cryptoRng, type Rng } from './dice';
import { applyEffect, describeEffect, isDown, resolveAction, sanitizeAdjudication } from './rules';

export const MAX_ACTION_LENGTH = 400;
const MAX_NARRATION_LENGTH = 2000;
const RECENT_EVENT_COUNT = 8;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewEvent = DistributiveOmit<GameEvent, 'id' | 'at' | 'ts'>;

export function isPartyWiped(state: CampaignState): boolean {
  return state.partyOrder.every((id) => {
    const c = state.characters[id];
    return !c || isDown(c);
  });
}

/** Add an event, stamping it with the next id, the in-game clock and real time. */
export function appendEvent(state: CampaignState, event: NewEvent, ts: number): CampaignState {
  const full = {
    ...event,
    id: `evt-${state.nextEventSeq}`,
    at: state.clock,
    ts,
  } as GameEvent;
  return { ...state, events: [...state.events, full], nextEventSeq: state.nextEventSeq + 1 };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * The read-only snapshot a Game Master is allowed to see.
 *
 * It is a deep COPY that is then frozen. `DeepReadonly` only protects against
 * mistakes at compile time; the copy and the freeze are what make it true at
 * runtime, so a buggy or hostile Game Master cannot reach the real state by
 * editing what it was handed (an attempt throws, and `processAction` treats a
 * throwing Game Master as "nothing happens").
 */
export function buildContext(state: CampaignState, actorId: PlayerId): GMContext {
  const location = state.locations[state.locationId];
  const snapshot = structuredClone({
    actor: state.characters[actorId],
    party: state.partyOrder.map((id) => state.characters[id]),
    location,
    locations: Object.values(state.locations),
    exits: location.exits.map((id) => ({ id, name: state.locations[id]?.name ?? id })),
    noise: state.noise,
    clockLabel: formatClock(state.clock),
    objectives: state.objectives,
    recentEvents: state.events.slice(-RECENT_EVENT_COUNT),
  });
  return deepFreeze(snapshot);
}

function plainNarration(resolution: Resolution): string {
  if (resolution.facts.refusedReason) return resolution.facts.refusedReason;
  return 'Time passes. The building keeps its secrets.';
}

export interface ProcessOptions {
  gm: GameMaster;
  rng?: Rng;
  now?: () => number;
  /** Called once the player's action is on the record, before the GM answers. */
  onProgress?: (state: CampaignState) => void;
}

/**
 * Run one player action through the full pipeline and return the new state.
 * Never throws because of a Game Master failure: a broken or malicious GM
 * degrades to "nothing mechanical happens".
 */
export async function processAction(
  state: CampaignState,
  playerId: PlayerId,
  text: string,
  options: ProcessOptions,
): Promise<CampaignState> {
  const { gm, rng = cryptoRng, now = Date.now, onProgress } = options;
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_ACTION_LENGTH);
  if (!state.characters[playerId] || clean === '' || isPartyWiped(state)) return state;

  const action: PlayerAction = {
    id: `act-${state.nextEventSeq}`,
    playerId,
    text: clean,
    submittedAt: now(),
  };

  let s = appendEvent(state, { kind: 'player_action', playerId, text: clean }, now());
  onProgress?.(s);
  const ctx = buildContext(s, playerId);

  let raw: unknown;
  try {
    raw = await gm.adjudicate(ctx, action);
  } catch {
    raw = undefined;
    s = appendEvent(
      s,
      { kind: 'system', text: 'The Game Master could not rule on that action. Nothing happens.' },
      now(),
    );
  }

  const adjudication = sanitizeAdjudication(raw, s);
  const resolution = resolveAction(s, playerId, adjudication, rng);

  if (adjudication.intent !== 'talk') {
    s = appendEvent(s, { kind: 'system', text: `Ruling: ${adjudication.rationale}` }, now());
  }
  if (resolution.check) {
    s = appendEvent(s, { kind: 'check', playerId, check: resolution.check }, now());
  }
  for (const effect of resolution.effects) {
    const summary = describeEffect(s, effect);
    s = applyEffect(s, effect);
    if (summary) s = appendEvent(s, { kind: 'effect', effect, summary }, now());
  }

  let narration = '';
  try {
    narration = (await gm.narrate(ctx, action, resolution)).trim().slice(0, MAX_NARRATION_LENGTH);
  } catch {
    narration = '';
  }
  s = appendEvent(s, { kind: 'narration', text: narration || plainNarration(resolution) }, now());

  if (isPartyWiped(s)) {
    s = appendEvent(
      s,
      { kind: 'system', text: 'Every survivor is down. The campaign is over.' },
      now(),
    );
  }
  return s;
}
