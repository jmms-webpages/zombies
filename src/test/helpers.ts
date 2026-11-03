/** Shared helpers for tests. Not shipped: nothing in the app imports this file. */
import type { CampaignState, Character, GameMaster, PlayerId } from '../types';
import type { Rng } from '../game/dice';
import { createMockCampaign } from '../data/mockCampaign';

/** An Rng that returns the given values in order, then starts over. */
export const seq =
  (...values: number[]): Rng =>
  {
    let i = 0;
    return () => values[i++ % values.length];
  };

/** The Rng value that makes a d20 come up as `n` (1–20). */
export const d20 = (n: number): number => (n - 0.5) / 20;

/** The Rng value that makes a die with `sides` sides come up as `n`. */
export const die = (sides: number, n: number): number => (n - 0.5) / sides;

export const freshState = (): CampaignState => createMockCampaign(() => 1_000);

export function patchCharacter(
  state: CampaignState,
  id: PlayerId,
  patch: (c: Character) => Character,
): CampaignState {
  return { ...state, characters: { ...state.characters, [id]: patch(state.characters[id]) } };
}

export const setHealth = (state: CampaignState, id: PlayerId, current: number) =>
  patchCharacter(state, id, (c) => ({ ...c, health: { ...c.health, current } }));

export const setStamina = (state: CampaignState, id: PlayerId, current: number) =>
  patchCharacter(state, id, (c) => ({ ...c, stamina: { ...c.stamina, current } }));

export const moveTo = (state: CampaignState, locationId: string): CampaignState => ({
  ...state,
  locationId,
});

/** A Game Master whose rulings come from a function, for testing the pipeline. */
export function stubGm(
  adjudicate: (...args: Parameters<GameMaster['adjudicate']>) => unknown,
  narrate: GameMaster['narrate'] = async () => 'Narration.',
): GameMaster {
  return { name: 'Stub GM', adjudicate: async (ctx, action) => adjudicate(ctx, action), narrate };
}
