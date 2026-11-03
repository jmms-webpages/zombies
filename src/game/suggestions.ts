/**
 * Quick-action chips shown above the action box. They only pre-fill text; the
 * player still sends it, and the Game Master still interprets it like anything
 * else typed by hand.
 */
import type { CampaignState, PlayerId } from '../types';
import { REST_MAX_DANGER, isDown } from './rules';

export function suggestActions(state: CampaignState, playerId: PlayerId): string[] {
  const actor = state.characters[playerId];
  if (!actor || isDown(actor)) return [];
  const location = state.locations[state.locationId];
  const out: string[] = [];

  if (location.lootRemaining > 0 && location.lootTable.length > 0) {
    out.push(`Search the ${location.name.toLowerCase()} for supplies`);
  }
  out.push('Listen carefully for movement');

  const hurt = state.partyOrder
    .map((id) => state.characters[id])
    .find((c) => c.health.current < c.health.max && !isDown(c));
  const hasMedical = actor.inventory.some((i) => i.kind === 'medical' && i.quantity > 0);
  if (hurt && hasMedical) {
    out.push(hurt.id === actor.id ? 'Bandage my wounds' : `Bandage ${hurt.name.split(' ')[0]}'s wounds`);
  }

  if (location.dangerLevel <= REST_MAX_DANGER && actor.stamina.current < actor.stamina.max) {
    out.push('Rest and catch my breath');
  }

  for (const id of location.exits.slice(0, 3)) {
    out.push(`Quietly go to the ${state.locations[id].name}`);
  }
  return out;
}
