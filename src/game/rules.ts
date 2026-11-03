/**
 * The rules of the game. Pure functions over typed data: no React, no Firebase,
 * no network. This module is the ONLY place that decides what a roll means and
 * the only thing that changes authoritative state (via `applyEffect`).
 *
 * A Game Master (scripted or AI) never touches this state. It proposes an
 * `Adjudication`; `sanitizeAdjudication` validates it and `resolveAction`
 * turns it into `Effect`s with numbers the rules module picks itself.
 */
import type {
  Adjudication,
  CampaignState,
  Character,
  CheckOutcome,
  CheckResult,
  DifficultyId,
  Effect,
  Exertion,
  Intent,
  PlayerId,
  Resolution,
  ResolutionFacts,
  RiskLevel,
  SkillId,
} from '../types';
import { SKILL_IDS } from '../types';
import { cryptoRng, pickWeighted, rollD20, rollDice, rollDie, type Rng } from './dice';
import { bestItemBonus, createItem } from './items';

// ── Tunable numbers ───────────────────────────────────────────────────────

export const DIFFICULTY_DC: Record<DifficultyId, number> = {
  easy: 8,
  routine: 11,
  hard: 14,
  very_hard: 17,
  extreme: 20,
};

export const MAX_NOISE = 10;
export const EXERTION_COST: Record<Exertion, number> = { light: 0, moderate: 1, heavy: 2 };
export const REST_STAMINA = 3;
/** You can only rest somewhere with danger at or below this. */
export const REST_MAX_DANGER = 2;
export const EXHAUSTED_PENALTY = -2;

const MINUTES = { check: 15, move: 5, talk: 5, rest: 60, treat: 15 } as const;

const INTENTS: readonly Intent[] = ['check', 'move', 'rest', 'treat', 'talk'];
const DIFFICULTIES = Object.keys(DIFFICULTY_DC) as DifficultyId[];
const RISKS: readonly RiskLevel[] = ['none', 'low', 'moderate', 'severe'];
const EXERTIONS: readonly Exertion[] = ['light', 'moderate', 'heavy'];

// ── Small helpers ─────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function isDown(character: Character): boolean {
  return character.health.current <= 0;
}

/** Noise makes everything harder: the dead are listening. */
export function noiseDcPenalty(noise: number): number {
  if (noise >= 8) return 2;
  if (noise >= 5) return 1;
  return 0;
}

export function fatiguePenalty(character: Character): number {
  return character.stamina.current <= 0 ? EXHAUSTED_PENALTY : 0;
}

export function classifyRoll(roll: number, total: number, dc: number): CheckOutcome {
  if (roll === 20) return 'critical_success';
  if (roll === 1) return 'critical_failure';
  return total >= dc ? 'success' : 'failure';
}

export function isSuccess(outcome: CheckOutcome): boolean {
  return outcome === 'success' || outcome === 'critical_success';
}

// ── The d20 check ─────────────────────────────────────────────────────────

/** d20 + skill modifier (+ best item bonus, − exhaustion) against a DC. */
export function resolveCheck(
  character: Character,
  skill: SkillId,
  difficulty: DifficultyId,
  noise: number,
  rng: Rng = cryptoRng,
): CheckResult {
  const roll = rollD20(rng);
  const skillModifier = character.skills[skill] ?? 0;
  const itemBonus = bestItemBonus(character.inventory, skill);
  const fatigue = fatiguePenalty(character);
  const modifier = skillModifier + itemBonus + fatigue;
  const total = roll + modifier;
  const baseDc = DIFFICULTY_DC[difficulty];
  const dc = baseDc + noiseDcPenalty(noise);
  return {
    skill,
    roll,
    skillModifier,
    itemBonus,
    fatiguePenalty: fatigue,
    modifier,
    total,
    difficulty,
    baseDc,
    dc,
    margin: total - dc,
    outcome: classifyRoll(roll, total, dc),
  };
}

// ── Validating Game Master output ─────────────────────────────────────────

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

/**
 * Turn whatever a Game Master returned into a safe `Adjudication`. Anything
 * unrecognised is dropped or defaulted; a 'check' without a usable skill is
 * downgraded to 'talk'. The GM can never supply numbers, so there is nothing
 * to clamp, but it also cannot name a player or place that does not exist.
 */
export function sanitizeAdjudication(raw: unknown, state: CampaignState): Adjudication {
  const fallback: Adjudication = {
    intent: 'talk',
    risk: 'none',
    exertion: 'light',
    noisy: false,
    rationale: 'No clear mechanical effect.',
  };
  if (typeof raw !== 'object' || raw === null) return fallback;
  const r = raw as Record<string, unknown>;

  const intent = oneOf(r.intent, INTENTS);
  if (!intent) return fallback;

  const skill = oneOf(r.skill, SKILL_IDS);
  const difficulty = oneOf(r.difficulty, DIFFICULTIES);
  const targetPlayerId =
    typeof r.targetPlayerId === 'string' && state.characters[r.targetPlayerId]
      ? r.targetPlayerId
      : undefined;
  const destinationId =
    typeof r.destinationId === 'string' && state.locations[r.destinationId]
      ? r.destinationId
      : undefined;

  const cleaned: Adjudication = {
    intent,
    skill,
    difficulty: difficulty ?? (skill ? 'routine' : undefined),
    risk: oneOf(r.risk, RISKS) ?? 'none',
    exertion: oneOf(r.exertion, EXERTIONS) ?? 'light',
    noisy: r.noisy === true,
    targetPlayerId,
    destinationId,
    rationale:
      typeof r.rationale === 'string' ? r.rationale.trim().slice(0, 200) : fallback.rationale,
  };

  if (intent === 'check' && !skill) return { ...fallback, rationale: cleaned.rationale };
  return cleaned;
}

// ── Resolving an action into effects ──────────────────────────────────────

function rollDamage(risk: RiskLevel, outcome: CheckOutcome, rng: Rng): number {
  if (risk === 'none') return 0;
  let damage = risk === 'low' ? 1 : risk === 'moderate' ? rollDie(3, rng) : rollDie(4, rng) + 1;
  if (outcome === 'critical_failure') damage += 1;
  return damage;
}

function noiseDelta(noisy: boolean, check?: CheckResult): number {
  if (!noisy) return -1;
  return check && !isSuccess(check.outcome) ? 3 : 2;
}

function staminaCost(exertion: Exertion, check?: CheckResult): number {
  const base = EXERTION_COST[exertion];
  return check?.outcome === 'critical_success' ? Math.max(0, base - 1) : base;
}

function emptyFacts(state: CampaignState): ResolutionFacts {
  return {
    itemsFound: [],
    lootExhausted: false,
    healthLost: 0,
    healthRestored: 0,
    staminaSpent: 0,
    staminaRestored: 0,
    actorDown: false,
    targetDown: false,
    noiseAfter: state.noise,
  };
}

/**
 * Decide what an adjudicated action does. Returns the effects to apply (it
 * does NOT apply them) plus the plain-English facts the GM narrates.
 */
export function resolveAction(
  state: CampaignState,
  actorId: PlayerId,
  adjudication: Adjudication,
  rng: Rng = cryptoRng,
): Resolution {
  const actor = state.characters[actorId];
  if (!actor) throw new Error(`Unknown player "${actorId}".`);
  const location = state.locations[state.locationId];
  const facts = emptyFacts(state);
  const effects: Effect[] = [];
  let check: CheckResult | undefined;

  const refuse = (reason: string): Resolution => ({
    adjudication,
    effects: [],
    facts: { ...facts, refusedReason: reason },
  });

  if (isDown(actor)) return refuse(`${actor.name} is down and cannot act.`);

  const addStamina = (cost: number) => {
    const spent = Math.min(cost, actor.stamina.current);
    if (spent > 0) {
      effects.push({ type: 'stamina', playerId: actorId, delta: -spent });
      facts.staminaSpent += spent;
    }
  };
  const addDamage = (damage: number) => {
    if (damage > 0) {
      const lost = Math.min(damage, actor.health.current);
      effects.push({ type: 'health', playerId: actorId, delta: -damage });
      facts.healthLost += lost;
    }
  };

  switch (adjudication.intent) {
    case 'talk': {
      effects.push({ type: 'time', minutes: MINUTES.talk });
      effects.push({ type: 'noise', delta: noiseDelta(adjudication.noisy) });
      break;
    }

    case 'rest': {
      if (location.dangerLevel > REST_MAX_DANGER) {
        return refuse(`The ${location.name} is too exposed to rest in.`);
      }
      effects.push({ type: 'time', minutes: MINUTES.rest });
      const gain = Math.min(REST_STAMINA, actor.stamina.max - actor.stamina.current);
      if (gain > 0) {
        effects.push({ type: 'stamina', playerId: actorId, delta: gain });
        facts.staminaRestored = gain;
      }
      effects.push({ type: 'noise', delta: -2 });
      break;
    }

    case 'move': {
      const destination = adjudication.destinationId
        ? state.locations[adjudication.destinationId]
        : undefined;
      if (!destination) return refuse('There is nowhere like that to go.');
      if (destination.id === location.id) return refuse(`You are already in the ${location.name}.`);
      if (!location.exits.includes(destination.id)) {
        return refuse(`You cannot reach the ${destination.name} directly from the ${location.name}.`);
      }
      if (adjudication.skill && adjudication.difficulty) {
        check = resolveCheck(actor, adjudication.skill, adjudication.difficulty, state.noise, rng);
      }
      effects.push({ type: 'time', minutes: MINUTES.move });
      addStamina(staminaCost(adjudication.exertion, check));
      if (check && !isSuccess(check.outcome)) {
        addDamage(rollDamage(adjudication.risk, check.outcome, rng));
      }
      effects.push({ type: 'noise', delta: noiseDelta(adjudication.noisy, check) });
      effects.push({ type: 'move', to: destination.id });
      facts.movedTo = destination.name;
      break;
    }

    case 'treat': {
      const target = state.characters[adjudication.targetPlayerId ?? actorId] ?? actor;
      facts.targetName = target.name;
      const supply = actor.inventory.find((i) => i.kind === 'medical' && i.quantity > 0);
      if (!supply) return refuse(`${actor.name} has no bandages or gauze to work with.`);
      if (target.health.current >= target.health.max) return refuse(`${target.name} is not hurt.`);

      // Treating wounds is always a Medicine check, whatever the GM proposed.
      check = resolveCheck(actor, 'medicine', adjudication.difficulty ?? 'routine', state.noise, rng);
      effects.push({ type: 'time', minutes: MINUTES.treat });
      addStamina(staminaCost(adjudication.exertion, check));
      if (check.outcome !== 'critical_success') {
        effects.push({ type: 'item_consumed', playerId: actorId, templateId: supply.templateId, quantity: 1 });
      }
      if (isSuccess(check.outcome)) {
        const heal = rollDie(4, rng) + (check.outcome === 'critical_success' ? 2 : 0);
        const restored = Math.min(heal, target.health.max - target.health.current);
        effects.push({ type: 'health', playerId: target.id, delta: heal });
        facts.healthRestored = restored;
      }
      effects.push({ type: 'noise', delta: noiseDelta(adjudication.noisy, check) });
      break;
    }

    case 'check': {
      if (!adjudication.skill) return refuse('Nothing to roll for.');
      check = resolveCheck(
        actor,
        adjudication.skill,
        adjudication.difficulty ?? 'routine',
        state.noise,
        rng,
      );
      effects.push({ type: 'time', minutes: MINUTES.check });
      addStamina(staminaCost(adjudication.exertion, check));

      if (!isSuccess(check.outcome)) {
        addDamage(rollDamage(adjudication.risk, check.outcome, rng));
      } else if (check.skill === 'scavenging') {
        if (location.lootRemaining > 0 && location.lootTable.length > 0) {
          const finds = check.outcome === 'critical_success' ? 2 : 1;
          for (let i = 0; i < finds; i++) {
            const entry = pickWeighted(location.lootTable, rng);
            if (!entry) break;
            const item = createItem(entry.templateId);
            effects.push({ type: 'item_gained', playerId: actorId, templateId: item.templateId, quantity: 1 });
            facts.itemsFound.push(item.name);
          }
          effects.push({ type: 'loot_spent', locationId: location.id });
        } else {
          facts.lootExhausted = true;
        }
      }
      effects.push({ type: 'noise', delta: noiseDelta(adjudication.noisy, check) });
      break;
    }
  }

  const after = effects.reduce(applyEffect, state);
  facts.noiseAfter = after.noise;
  facts.actorDown = isDown(after.characters[actorId]);
  const targetId = facts.targetName ? (adjudication.targetPlayerId ?? actorId) : undefined;
  facts.targetDown = targetId ? isDown(after.characters[targetId]) : false;

  return { adjudication, check, effects, facts };
}

// ── Applying effects (the only way state changes) ─────────────────────────

function updateCharacter(
  state: CampaignState,
  id: PlayerId,
  update: (c: Character) => Character,
): CampaignState {
  const existing = state.characters[id];
  if (!existing) return state;
  return { ...state, characters: { ...state.characters, [id]: update(existing) } };
}

export function applyEffect(state: CampaignState, effect: Effect): CampaignState {
  switch (effect.type) {
    case 'health':
      return updateCharacter(state, effect.playerId, (c) => ({
        ...c,
        health: { ...c.health, current: clamp(c.health.current + effect.delta, 0, c.health.max) },
      }));

    case 'stamina':
      return updateCharacter(state, effect.playerId, (c) => ({
        ...c,
        stamina: { ...c.stamina, current: clamp(c.stamina.current + effect.delta, 0, c.stamina.max) },
      }));

    case 'noise':
      return { ...state, noise: clamp(state.noise + effect.delta, 0, MAX_NOISE) };

    case 'item_gained':
      return updateCharacter(state, effect.playerId, (c) => {
        const existing = c.inventory.find((i) => i.templateId === effect.templateId);
        if (existing) {
          return {
            ...c,
            inventory: c.inventory.map((i) =>
              i === existing ? { ...i, quantity: i.quantity + effect.quantity } : i,
            ),
          };
        }
        return { ...c, inventory: [...c.inventory, createItem(effect.templateId, effect.quantity)] };
      });

    case 'item_consumed':
      return updateCharacter(state, effect.playerId, (c) => ({
        ...c,
        inventory: c.inventory
          .map((i) =>
            i.templateId === effect.templateId ? { ...i, quantity: i.quantity - effect.quantity } : i,
          )
          .filter((i) => i.quantity > 0),
      }));

    case 'move':
      return state.locations[effect.to] ? { ...state, locationId: effect.to } : state;

    case 'loot_spent': {
      const loc = state.locations[effect.locationId];
      if (!loc) return state;
      return {
        ...state,
        locations: {
          ...state.locations,
          [loc.id]: { ...loc, lootRemaining: Math.max(0, loc.lootRemaining - 1) },
        },
      };
    }

    case 'time':
      return { ...state, clock: state.clock + Math.max(0, effect.minutes) };
  }
}

export function applyEffects(state: CampaignState, effects: readonly Effect[]): CampaignState {
  return effects.reduce(applyEffect, state);
}

/** A one-line description of an effect for the event log, or null if not worth logging. */
export function describeEffect(before: CampaignState, effect: Effect): string | null {
  switch (effect.type) {
    case 'health': {
      const c = before.characters[effect.playerId];
      if (!c) return null;
      const now = clamp(c.health.current + effect.delta, 0, c.health.max);
      if (now === c.health.current) return null;
      const verb = effect.delta < 0 ? `loses ${c.health.current - now}` : `recovers ${now - c.health.current}`;
      const down = now === 0 ? ' and is DOWN' : '';
      return `${c.name} ${verb} health (${now}/${c.health.max})${down}`;
    }
    case 'stamina': {
      const c = before.characters[effect.playerId];
      if (!c) return null;
      const now = clamp(c.stamina.current + effect.delta, 0, c.stamina.max);
      if (now === c.stamina.current) return null;
      const verb = effect.delta < 0 ? `spends ${c.stamina.current - now}` : `recovers ${now - c.stamina.current}`;
      return `${c.name} ${verb} stamina (${now}/${c.stamina.max})`;
    }
    case 'noise': {
      const now = clamp(before.noise + effect.delta, 0, MAX_NOISE);
      if (now === before.noise) return null;
      return `Noise ${now > before.noise ? 'rises' : 'falls'} to ${now}/${MAX_NOISE}`;
    }
    case 'item_gained': {
      const c = before.characters[effect.playerId];
      return c ? `${c.name} finds ${createItem(effect.templateId, effect.quantity).name}` : null;
    }
    case 'item_consumed': {
      const c = before.characters[effect.playerId];
      return c ? `${c.name} uses up ${createItem(effect.templateId).name}` : null;
    }
    case 'move': {
      const to = before.locations[effect.to];
      const from = before.locations[before.locationId];
      return to && from ? `The group moves from ${from.name} to ${to.name}` : null;
    }
    case 'loot_spent':
    case 'time':
      return null;
  }
}

// ── Roll helpers re-exported for tests and UI ─────────────────────────────
export { rollD20, rollDice };
