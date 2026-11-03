/**
 * A keyword-driven Game Master that needs no network and no API key.
 *
 * It implements the same `GameMaster` interface a Claude-backed version will,
 * so swapping is a one-line change where the GM is constructed. Like any GM it
 * can only *propose* (`adjudicate`) and *describe* (`narrate`); the rules module
 * decides every number.
 */
import type {
  Adjudication,
  CheckOutcome,
  DeepReadonly,
  DifficultyId,
  GameMaster,
  GMContext,
  Location,
  PlayerAction,
  Resolution,
  RiskLevel,
  SkillId,
} from '../types';
import { cryptoRng, pick, type Rng } from '../game/dice';

export interface ScriptedGMOptions {
  /** Pretend to think for this long, so the UI can show a waiting state. */
  latencyMs?: number;
  rng?: Rng;
}

// ── Reading the player's text ─────────────────────────────────────────────

const normalize = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'");
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text: string, words: string[]) =>
  new RegExp(`\\b(?:${words.map(escapeRegExp).join('|')})\\b`).test(text);

/** The location a player is talking about, preferring the longest matching name. */
export function findLocationInText(
  text: string,
  locations: readonly DeepReadonly<Location>[],
): DeepReadonly<Location> | undefined {
  const t = normalize(text);
  let best: { loc: DeepReadonly<Location>; len: number } | undefined;
  for (const loc of locations) {
    for (const name of [loc.name, ...loc.aliases]) {
      const n = normalize(name);
      if (new RegExp(`\\b${escapeRegExp(n)}\\b`).test(t) && (!best || n.length > best.len)) {
        best = { loc, len: n.length };
      }
    }
  }
  return best?.loc;
}

const MOVE_WORDS = [
  'go', 'head', 'move', 'walk', 'run', 'sprint', 'dash', 'sneak', 'creep',
  'enter', 'travel', 'return', 'retreat', 'rush', 'cross',
];
const REST_WORDS = ['rest', 'sleep', 'nap', 'recover', 'catch my breath', 'catch our breath'];
const TREAT_WORDS = ['bandage', 'treat', 'patch', 'heal', 'first aid', 'stitch', 'dress the wound', 'tend'];
const LOUD_WORDS = ['smash', 'kick', 'break', 'bash', 'slam', 'shout', 'yell', 'scream', 'whistle', 'crash', 'barricade', 'drag', 'shove'];
const QUIET_WORDS = ['quiet', 'quietly', 'silent', 'silently', 'carefully', 'slowly', 'sneak', 'creep', 'tiptoe'];

const SKILL_KEYWORDS: [SkillId, string[]][] = [
  ['fighting', ['fight', 'attack', 'hit', 'strike', 'swing', 'kill', 'bash', 'stab', 'club', 'smash', 'shoot', 'defend']],
  ['medicine', ['examine', 'diagnose', 'check wound', 'inspect wound']],
  ['stealth', ['hide', 'sneak', 'creep', 'tiptoe', 'slip past', 'stay low', 'quietly']],
  ['scavenging', ['search', 'scavenge', 'loot', 'rummage', 'ransack', 'forage', 'dig through', 'look for', 'gather', 'raid']],
  ['athletics', ['climb', 'jump', 'vault', 'lift', 'push', 'shove', 'barricade', 'drag', 'sprint', 'run', 'dash', 'brace']],
  ['tech', ['hack', 'wire', 'repair', 'fix', 'radio', 'computer', 'phone', 'lock', 'pick the', 'power', 'generator', 'circuit', 'tune']],
  ['awareness', ['listen', 'look', 'watch', 'scout', 'peek', 'observe', 'inspect', 'check', 'scan', 'survey', 'notice']],
];

function detectSkill(text: string): SkillId | undefined {
  for (const [skill, words] of SKILL_KEYWORDS) if (hasWord(text, words)) return skill;
  return undefined;
}

function riskFor(danger: number): RiskLevel {
  if (danger <= 1) return 'none';
  if (danger === 2) return 'low';
  if (danger <= 4) return 'moderate';
  return 'severe';
}

function difficultyFor(danger: number): DifficultyId {
  if (danger <= 2) return 'routine';
  if (danger <= 4) return 'hard';
  return 'very_hard';
}

// ── Narration templates ───────────────────────────────────────────────────

type Lines = Record<CheckOutcome, string[]>;

const CHECK_LINES: Record<SkillId, Lines> = {
  fighting: {
    critical_success: ['{a} fights like they have been waiting all day for this. The blow lands clean, and the threat stops moving for good.'],
    success: ['{a} lands a solid hit. The dead thing folds, and for a moment nothing else stirs.'],
    failure: ['{a}’s swing goes wide. Cold fingers find a sleeve before {a} wrenches free, breathing hard.'],
    critical_failure: ['{a} slips. The weapon clangs off the floor, loud as a bell, and something nearby turns its head.'],
  },
  stealth: {
    critical_success: ['{a} moves like a draft under a door. Nothing so much as shifts.'],
    success: ['{a} keeps low and quiet, and the shapes in the dark never notice.'],
    failure: ['{a} freezes as a shoe scuffs tile. Somewhere ahead, the shuffling pauses. Listening.'],
    critical_failure: ['{a} knocks something over. The crash rolls down the corridor and does not stop rolling.'],
  },
  scavenging: {
    critical_success: ['{a} has a gift for it. Behind the obvious, in the place nobody checks, there is more than expected.'],
    success: ['{a} works through the room methodically, hands steady, and comes up with something real.'],
    failure: ['{a} turns the place over and finds mostly dust, broken glass and disappointment.'],
    critical_failure: ['{a} reaches into the dark of a cabinet and something inside answers with a clatter.'],
  },
  medicine: {
    critical_success: ['{a} reads the situation at a glance and does exactly the right thing.'],
    success: ['{a} works with practiced calm. It is not pretty, but it will hold.'],
    failure: ['{a} fumbles. Blood makes everything slippery and time is not on their side.'],
    critical_failure: ['{a}’s hands shake. The bandage tears, the tape will not stick, and the wound is worse for the effort.'],
  },
  athletics: {
    critical_success: ['{a} makes it look easy. Muscle, momentum, and the job is done.'],
    success: ['{a} grits their teeth and gets it done, arms burning.'],
    failure: ['{a} heaves, and the weight does not move enough. Something in the shoulder protests.'],
    critical_failure: ['{a} loses footing at the worst moment and the whole thing goes down with a bang.'],
  },
  tech: {
    critical_success: ['{a} finds the trick almost immediately. It clicks, hums, and obeys.'],
    success: ['{a} coaxes it along with patience and a little profanity. It works.'],
    failure: ['{a} stares at the wiring. It stares back. Nothing yet.'],
    critical_failure: ['{a} touches the wrong contact. A spark, a smell of burnt plastic, and a lot of unwanted noise.'],
  },
  awareness: {
    critical_success: ['{a} notices what everyone else would miss: a detail that changes the picture.'],
    success: ['{a} watches and listens. The building reveals a little of itself.'],
    failure: ['{a} strains to hear anything over the blood in their ears. Nothing certain.'],
    critical_failure: ['{a} looks the wrong way at the wrong time. Something looks back.'],
  },
};

const TALK_LINES = [
  '{a} speaks low. Nobody answers right away; the building creaks into the pause.',
  'The words hang in the air. Far off, a locker door swings and bangs shut.',
  '{a} says it plainly. It is not much, but it is something human in a very inhuman place.',
];

const REST_LINES = [
  '{a} slides down a wall and breathes. An hour of cold quiet, and the shaking in the legs finally eases.',
  '{a} takes an hour with eyes half-closed, one hand on the nearest weapon. The silence holds.',
];

const NOISE_LINES: [number, string][] = [
  [9, 'Down the hall, many things are now moving in the same direction.'],
  [7, 'The thumping at the doors has changed rhythm. It has become interested.'],
  [5, 'Somewhere in the building, a door that was closed is now open.'],
];

function fill(template: string, actor: string): string {
  return template.replaceAll('{a}', actor);
}

// ── The Game Master ───────────────────────────────────────────────────────

export class ScriptedGameMaster implements GameMaster {
  readonly name = 'Scripted Game Master';
  private readonly latencyMs: number;
  private readonly rng: Rng;

  constructor(options: ScriptedGMOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;
    this.rng = options.rng ?? cryptoRng;
  }

  private async think(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  async adjudicate(ctx: GMContext, action: PlayerAction): Promise<Adjudication> {
    await this.think();
    const text = normalize(action.text);
    const danger = ctx.location.dangerLevel;
    const loud = hasWord(text, LOUD_WORDS);
    const quiet = hasWord(text, QUIET_WORDS);
    const base = { risk: 'none' as RiskLevel, exertion: 'light' as const, noisy: loud };

    // Treating wounds
    if (hasWord(text, TREAT_WORDS)) {
      const target = ctx.party.find(
        (p) => p.id !== ctx.actor.id && new RegExp(`\\b${escapeRegExp(normalize(p.name.split(' ')[0]))}\\b`).test(text),
      );
      return {
        ...base,
        intent: 'treat',
        skill: 'medicine',
        difficulty: 'routine',
        exertion: 'light',
        targetPlayerId: target?.id,
        rationale: `${ctx.actor.name} tends wounds${target ? ` on ${target.name}` : ''}.`,
      };
    }

    // Resting
    if (hasWord(text, REST_WORDS)) {
      return { ...base, intent: 'rest', rationale: `${ctx.actor.name} takes time to recover.` };
    }

    // Moving
    if (hasWord(text, MOVE_WORDS)) {
      const destination = findLocationInText(text, ctx.locations);
      if (destination && destination.id !== ctx.location.id) {
        const sprint = hasWord(text, ['run', 'sprint', 'dash', 'rush']);
        const sneak = quiet;
        const skill: SkillId | undefined = sprint ? 'athletics' : sneak ? 'stealth' : destination.dangerLevel >= 3 ? 'awareness' : undefined;
        return {
          intent: 'move',
          skill,
          difficulty: skill ? difficultyFor(destination.dangerLevel) : undefined,
          risk: riskFor(destination.dangerLevel),
          exertion: sprint ? 'heavy' : 'light',
          noisy: sprint || loud,
          destinationId: destination.id,
          rationale: `${ctx.actor.name} heads for the ${destination.name}.`,
        };
      }
    }

    // Anything with an obvious skill
    const skill = detectSkill(text);
    if (skill) {
      const fighting = skill === 'fighting';
      const heavy = skill === 'athletics' || fighting;
      return {
        intent: 'check',
        skill,
        difficulty: fighting ? (danger >= 4 ? 'very_hard' : 'hard') : difficultyFor(danger),
        risk: fighting ? (danger >= 4 ? 'severe' : 'moderate') : riskFor(danger),
        exertion: heavy ? 'moderate' : 'light',
        noisy: loud || fighting,
        rationale: `${ctx.actor.name} attempts a ${skill} check (${danger >= 3 ? 'risky' : 'manageable'} here).`,
      };
    }

    return { ...base, intent: 'talk', rationale: 'No clear mechanical effect.' };
  }

  async narrate(ctx: GMContext, _action: PlayerAction, resolution: Resolution): Promise<string> {
    await this.think();
    const actor = ctx.actor.name;
    const { facts, check, adjudication } = resolution;
    const parts: string[] = [];

    if (facts.refusedReason) {
      parts.push(facts.refusedReason);
    } else if (adjudication.intent === 'move' && facts.movedTo) {
      const dest = ctx.locations.find((l) => l.name === facts.movedTo);
      const leadIn = check && !(check.outcome === 'success' || check.outcome === 'critical_success')
        ? `${actor} gets there, but not cleanly. `
        : `${actor} makes the crossing. `;
      parts.push(`${leadIn}${dest ? dest.description : `You arrive at the ${facts.movedTo}.`}`);
    } else if (adjudication.intent === 'rest') {
      parts.push(fill(pick(REST_LINES, this.rng), actor));
    } else if (adjudication.intent === 'treat') {
      const who = facts.targetName ?? actor;
      if (check) parts.push(fill(pick(CHECK_LINES.medicine[check.outcome], this.rng), actor));
      if (facts.healthRestored > 0) parts.push(`${who} recovers ${facts.healthRestored} health.`);
    } else if (check) {
      parts.push(fill(pick(CHECK_LINES[check.skill][check.outcome], this.rng), actor));
    } else {
      parts.push(fill(pick(TALK_LINES, this.rng), actor));
    }

    if (facts.itemsFound.length > 0) parts.push(`Found: ${facts.itemsFound.join(', ')}.`);
    if (facts.lootExhausted) parts.push('There is nothing left worth finding here.');
    if (facts.healthLost > 0) parts.push(`${actor} loses ${facts.healthLost} health.`);
    if (facts.actorDown) parts.push(`${actor} goes down and does not get back up.`);

    if (!facts.refusedReason) {
      const noiseLine = NOISE_LINES.find(([threshold]) => facts.noiseAfter >= threshold);
      if (noiseLine) parts.push(noiseLine[1]);
    }
    return parts.join(' ');
  }
}
