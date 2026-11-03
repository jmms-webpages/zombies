/**
 * Shared data types for Zombie School RPG.
 *
 * This file has no runtime code and imports nothing, so game logic, the Game
 * Master, storage and UI can all depend on it without depending on each other.
 *
 * Authority model:
 *  - `CampaignState` (and everything inside it) is AUTHORITATIVE. Only the
 *    rules module (`src/game`) may produce a new one.
 *  - `Adjudication` is ADVISORY. A Game Master proposes it, the rules module
 *    validates it, and only then does anything happen.
 */

// ── Skills ────────────────────────────────────────────────────────────────

export const SKILL_IDS = [
  'fighting',
  'stealth',
  'scavenging',
  'medicine',
  'athletics',
  'tech',
  'awareness',
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

// ── Items & characters ────────────────────────────────────────────────────

export type ItemKind = 'weapon' | 'medical' | 'food' | 'tool' | 'key' | 'misc';

/** A passive bonus an item gives to one skill while it is in the inventory. */
export interface ItemBonus {
  skill: SkillId;
  value: number;
}

export interface Item {
  /** Key into the item catalog. Stacks merge on templateId. */
  templateId: string;
  name: string;
  description: string;
  kind: ItemKind;
  quantity: number;
  bonus?: ItemBonus;
}

export interface Meter {
  current: number;
  max: number;
}

export type PlayerId = string;

export interface Character {
  id: PlayerId;
  name: string;
  /** One-line "who they were before the outbreak". */
  background: string;
  health: Meter;
  stamina: Meter;
  /** Skill modifiers added to the d20. Typically -1 to +4. */
  skills: Record<SkillId, number>;
  inventory: Item[];
}

// ── World ─────────────────────────────────────────────────────────────────

export type LocationId = string;
export type DangerLevel = 1 | 2 | 3 | 4 | 5;

export interface LootEntry {
  templateId: string;
  /** Relative chance. */
  weight: number;
}

export interface Location {
  id: LocationId;
  name: string;
  description: string;
  /** Lower-case words a player might use to refer to this place. */
  aliases: string[];
  dangerLevel: DangerLevel;
  exits: LocationId[];
  lootTable: LootEntry[];
  /** How many more successful searches will turn something up. */
  lootRemaining: number;
  /** Starting value of `lootRemaining`, for UI hints. */
  lootInitial: number;
}

export interface Objective {
  id: string;
  text: string;
  status: 'active' | 'complete';
}

// ── Dice & checks ─────────────────────────────────────────────────────────

export type DifficultyId = 'easy' | 'routine' | 'hard' | 'very_hard' | 'extreme';

export type CheckOutcome =
  | 'critical_failure'
  | 'failure'
  | 'success'
  | 'critical_success';

export interface CheckResult {
  skill: SkillId;
  /** The raw d20 roll, 1–20. */
  roll: number;
  skillModifier: number;
  /** Best passive item bonus for this skill. */
  itemBonus: number;
  /** Negative when the character has no stamina left. */
  fatiguePenalty: number;
  /** skillModifier + itemBonus + fatiguePenalty. */
  modifier: number;
  total: number;
  difficulty: DifficultyId;
  /** DC from the difficulty table, before situational changes. */
  baseDc: number;
  /** DC actually used (baseDc plus the noise penalty). */
  dc: number;
  /** total - dc. */
  margin: number;
  outcome: CheckOutcome;
}

// ── Actions ───────────────────────────────────────────────────────────────

export interface PlayerAction {
  id: string;
  playerId: PlayerId;
  text: string;
  submittedAt: number;
}

// ── Effects (the ONLY way state changes) ──────────────────────────────────

export type Effect =
  | { type: 'health'; playerId: PlayerId; delta: number }
  | { type: 'stamina'; playerId: PlayerId; delta: number }
  | { type: 'noise'; delta: number }
  | { type: 'item_gained'; playerId: PlayerId; templateId: string; quantity: number }
  | { type: 'item_consumed'; playerId: PlayerId; templateId: string; quantity: number }
  | { type: 'move'; to: LocationId }
  | { type: 'loot_spent'; locationId: LocationId }
  | { type: 'time'; minutes: number };

// ── Game Master contract ──────────────────────────────────────────────────

export type Intent = 'check' | 'move' | 'rest' | 'treat' | 'talk';
export type RiskLevel = 'none' | 'low' | 'moderate' | 'severe';
export type Exertion = 'light' | 'moderate' | 'heavy';

/**
 * What a Game Master *proposes* for a player action. Note there are no
 * numbers of damage, healing or loot here: the GM names the situation and the
 * rules module decides what that means.
 */
export interface Adjudication {
  intent: Intent;
  /** Skill to roll. Required for 'check' and 'treat'; optional for 'move'. */
  skill?: SkillId;
  difficulty?: DifficultyId;
  risk: RiskLevel;
  exertion: Exertion;
  /** Does this action make a lot of noise? */
  noisy: boolean;
  /** For 'treat': who is being treated. Defaults to the actor. */
  targetPlayerId?: PlayerId;
  /** For 'move': where the player wants to go. */
  destinationId?: LocationId;
  /** One line of GM reasoning, shown in the event log. */
  rationale: string;
}

/** Plain-English facts about what the rules did, for the GM to narrate. */
export interface ResolutionFacts {
  refusedReason?: string;
  itemsFound: string[];
  lootExhausted: boolean;
  healthLost: number;
  healthRestored: number;
  staminaSpent: number;
  staminaRestored: number;
  movedTo?: string;
  targetName?: string;
  actorDown: boolean;
  targetDown: boolean;
  noiseAfter: number;
}

/** The rules module's verdict on an action; this is what the GM narrates. */
export interface Resolution {
  adjudication: Adjudication;
  check?: CheckResult;
  effects: Effect[];
  facts: ResolutionFacts;
}

export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Read-only snapshot of the game handed to a Game Master. */
export type GMContext = DeepReadonly<{
  actor: Character;
  party: Character[];
  location: Location;
  /** Every location, so the GM can interpret "go to the gym". */
  locations: Location[];
  exits: { id: LocationId; name: string }[];
  noise: number;
  clockLabel: string;
  objectives: Objective[];
  recentEvents: GameEvent[];
}>;

export interface GameMaster {
  readonly name: string;
  /**
   * Interpret a player's free-text action. The return value is UNTRUSTED: it
   * is validated by `sanitizeAdjudication` before the rules module uses it,
   * so a Claude-backed implementation can return parsed JSON directly.
   */
  adjudicate(ctx: GMContext, action: PlayerAction): Promise<unknown>;
  /** Turn a resolved action into story text. Text only; cannot change state. */
  narrate(ctx: GMContext, action: PlayerAction, resolution: Resolution): Promise<string>;
}

// ── Events & campaign state ───────────────────────────────────────────────

interface EventBase {
  id: string;
  /** In-game clock (minutes since midnight of day 1) when it happened. */
  at: number;
  /** Real-world timestamp (ms since epoch). */
  ts: number;
}

export type GameEvent =
  | (EventBase & { kind: 'player_action'; playerId: PlayerId; text: string })
  | (EventBase & { kind: 'narration'; text: string })
  | (EventBase & { kind: 'check'; playerId: PlayerId; check: CheckResult })
  | (EventBase & { kind: 'effect'; effect: Effect; summary: string })
  | (EventBase & { kind: 'system'; text: string });

export interface CampaignState {
  schemaVersion: 1;
  id: string;
  title: string;
  /** In-game minutes since midnight of day 1. */
  clock: number;
  locationId: LocationId;
  locations: Record<LocationId, Location>;
  characters: Record<PlayerId, Character>;
  /** Display order of the party. */
  partyOrder: PlayerId[];
  /** 0 (silent) to 10 (the whole building is coming). */
  noise: number;
  objectives: Objective[];
  events: GameEvent[];
  nextEventSeq: number;
}
