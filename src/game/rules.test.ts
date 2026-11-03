import { describe, expect, it } from 'vitest';
import type { Adjudication, CampaignState } from '../types';
import {
  DIFFICULTY_DC,
  MAX_NOISE,
  applyEffect,
  applyEffects,
  classifyRoll,
  describeEffect,
  noiseDcPenalty,
  resolveAction,
  resolveCheck,
  sanitizeAdjudication,
} from './rules';
import { bestItemBonus, createItem } from './items';
import { d20, die, freshState, moveTo, patchCharacter, seq, setHealth, setStamina } from '../test/helpers';

const adj = (over: Partial<Adjudication> = {}): Adjudication => ({
  intent: 'talk',
  risk: 'none',
  exertion: 'light',
  noisy: false,
  rationale: 'test',
  ...over,
});

const find = <T extends { type: string }>(effects: T[], type: string) => effects.find((e) => e.type === type);

describe('classifyRoll', () => {
  it('a natural 20 always succeeds critically, even below the DC', () => {
    expect(classifyRoll(20, 5, 30)).toBe('critical_success');
  });
  it('a natural 1 always fails critically, even above the DC', () => {
    expect(classifyRoll(1, 99, 5)).toBe('critical_failure');
  });
  it('otherwise total >= DC succeeds and total < DC fails', () => {
    expect(classifyRoll(10, 14, 14)).toBe('success');
    expect(classifyRoll(10, 13, 14)).toBe('failure');
  });
});

describe('resolveCheck (d20 + skill modifier)', () => {
  const state = freshState();
  const marcus = state.characters.marcus; // fighting +3, aluminum bat +1 fighting

  it('adds skill modifier and item bonus to the d20 and compares with the DC', () => {
    const r = resolveCheck(marcus, 'fighting', 'hard', 0, seq(d20(12)));
    expect(r.roll).toBe(12);
    expect(r.skillModifier).toBe(3);
    expect(r.itemBonus).toBe(1);
    expect(r.fatiguePenalty).toBe(0);
    expect(r.modifier).toBe(4);
    expect(r.total).toBe(16);
    expect(r.baseDc).toBe(DIFFICULTY_DC.hard);
    expect(r.dc).toBe(14);
    expect(r.margin).toBe(2);
    expect(r.outcome).toBe('success');
  });

  it('fails when the total is under the DC', () => {
    const r = resolveCheck(marcus, 'fighting', 'very_hard', 0, seq(d20(8)));
    expect(r.total).toBe(12);
    expect(r.margin).toBe(-5);
    expect(r.outcome).toBe('failure');
  });

  it('a natural 20 is a critical success and a natural 1 a critical failure', () => {
    const weak = state.characters.dana; // fighting -1
    expect(resolveCheck(weak, 'fighting', 'extreme', 0, seq(d20(20))).outcome).toBe('critical_success');
    const strong = patchCharacter(state, 'marcus', (c) => ({ ...c, skills: { ...c.skills, fighting: 10 } }))
      .characters.marcus;
    expect(resolveCheck(strong, 'fighting', 'easy', 0, seq(d20(1))).outcome).toBe('critical_failure');
  });

  it('an exhausted character takes a penalty', () => {
    const tired = setStamina(state, 'marcus', 0).characters.marcus;
    const r = resolveCheck(tired, 'fighting', 'hard', 0, seq(d20(10)));
    expect(r.fatiguePenalty).toBe(-2);
    expect(r.modifier).toBe(2); // 3 + 1 - 2
    expect(r.total).toBe(12);
  });

  it('noise raises the DC but never the base DC', () => {
    expect(noiseDcPenalty(4)).toBe(0);
    expect(noiseDcPenalty(5)).toBe(1);
    expect(noiseDcPenalty(7)).toBe(1);
    expect(noiseDcPenalty(8)).toBe(2);
    const quiet = resolveCheck(marcus, 'fighting', 'hard', 4, seq(d20(10)));
    const loud = resolveCheck(marcus, 'fighting', 'hard', 8, seq(d20(10)));
    expect(quiet.dc).toBe(14);
    expect(loud.dc).toBe(16);
    expect(loud.baseDc).toBe(14);
  });

  it('item bonuses do not stack: only the best counts', () => {
    const items = [createItem('aluminum_bat'), createItem('fire_axe'), createItem('pipe_wrench')];
    expect(bestItemBonus(items, 'fighting')).toBe(2);
    expect(bestItemBonus(items, 'stealth')).toBe(0);
  });
});

describe('sanitizeAdjudication (the Game Master is untrusted)', () => {
  const state = freshState();

  it('falls back to a harmless "talk" for anything that is not a usable object', () => {
    for (const raw of [null, undefined, 42, 'check', [], {}, { intent: 'explode' }]) {
      const a = sanitizeAdjudication(raw, state);
      expect(a.intent).toBe('talk');
      expect(a.risk).toBe('none');
    }
  });

  it('downgrades a check with no usable skill to "talk"', () => {
    expect(sanitizeAdjudication({ intent: 'check' }, state).intent).toBe('talk');
    expect(sanitizeAdjudication({ intent: 'check', skill: 'juggling' }, state).intent).toBe('talk');
  });

  it('defaults the difficulty and keeps valid fields', () => {
    const a = sanitizeAdjudication(
      { intent: 'check', skill: 'fighting', risk: 'severe', exertion: 'heavy', noisy: true, rationale: ' hit it ' },
      state,
    );
    expect(a).toEqual({
      intent: 'check',
      skill: 'fighting',
      difficulty: 'routine',
      risk: 'severe',
      exertion: 'heavy',
      noisy: true,
      targetPlayerId: undefined,
      destinationId: undefined,
      rationale: 'hit it',
    });
  });

  it('drops players and places that do not exist', () => {
    const a = sanitizeAdjudication(
      { intent: 'move', destinationId: 'narnia', targetPlayerId: 'bob' },
      state,
    );
    expect(a.destinationId).toBeUndefined();
    expect(a.targetPlayerId).toBeUndefined();
    const ok = sanitizeAdjudication({ intent: 'move', destinationId: 'cafeteria', targetPlayerId: 'dana' }, state);
    expect(ok.destinationId).toBe('cafeteria');
    expect(ok.targetPlayerId).toBe('dana');
  });

  it('has no way to carry numbers: damage, health and effects are discarded', () => {
    const a = sanitizeAdjudication(
      {
        intent: 'check',
        skill: 'fighting',
        damage: 999,
        health: 50,
        delta: 5,
        effects: [{ type: 'health', playerId: 'marcus', delta: 100 }],
      },
      state,
    );
    for (const key of ['damage', 'health', 'delta', 'effects']) expect(key in a).toBe(false);
  });

  it('caps the rationale length and only accepts a literal true for noisy', () => {
    expect(sanitizeAdjudication({ intent: 'talk', rationale: 'x'.repeat(500) }, state).rationale).toHaveLength(200);
    expect(sanitizeAdjudication({ intent: 'talk', noisy: 'true' }, state).noisy).toBe(false);
    expect(sanitizeAdjudication({ intent: 'talk', noisy: true }, state).noisy).toBe(true);
  });
});

describe('resolveAction', () => {
  describe('talk', () => {
    it('takes a little time and lets the noise fall', () => {
      const r = resolveAction(freshState(), 'dana', adj({ intent: 'talk' }));
      expect(r.check).toBeUndefined();
      expect(r.effects).toEqual([
        { type: 'time', minutes: 5 },
        { type: 'noise', delta: -1 },
      ]);
    });
  });

  describe('rest', () => {
    it('restores up to 3 stamina in a quiet place', () => {
      const s = setStamina(freshState(), 'marcus', 4);
      const r = resolveAction(s, 'marcus', adj({ intent: 'rest' }));
      expect(r.effects).toContainEqual({ type: 'stamina', playerId: 'marcus', delta: 3 });
      expect(r.effects).toContainEqual({ type: 'time', minutes: 60 });
      expect(r.facts.staminaRestored).toBe(3);
    });

    it('does not "restore" stamina that is already full', () => {
      const r = resolveAction(freshState(), 'marcus', adj({ intent: 'rest' }));
      expect(find(r.effects, 'stamina')).toBeUndefined();
      expect(r.facts.staminaRestored).toBe(0);
    });

    it('is refused somewhere dangerous', () => {
      const r = resolveAction(moveTo(freshState(), 'main_hall'), 'marcus', adj({ intent: 'rest' }));
      expect(r.effects).toEqual([]);
      expect(r.facts.refusedReason).toMatch(/too exposed/);
    });
  });

  describe('move', () => {
    it('moves through an exit', () => {
      const r = resolveAction(freshState(), 'dana', adj({ intent: 'move', destinationId: 'main_hall' }));
      expect(r.effects).toContainEqual({ type: 'move', to: 'main_hall' });
      expect(r.facts.movedTo).toBe('Main Hallway');
    });

    it('refuses places that are not directly connected, unknown, or where you already are', () => {
      const s = freshState();
      expect(resolveAction(s, 'dana', adj({ intent: 'move', destinationId: 'cafeteria' })).facts.refusedReason).toMatch(
        /cannot reach/,
      );
      expect(resolveAction(s, 'dana', adj({ intent: 'move' })).facts.refusedReason).toMatch(/nowhere/);
      expect(
        resolveAction(s, 'dana', adj({ intent: 'move', destinationId: 'front_office' })).facts.refusedReason,
      ).toMatch(/already/);
    });

    it('a failed risky dash costs stamina and health, and makes noise', () => {
      const r = resolveAction(
        freshState(),
        'dana',
        adj({
          intent: 'move',
          skill: 'athletics',
          difficulty: 'hard',
          risk: 'moderate',
          exertion: 'heavy',
          noisy: true,
          destinationId: 'main_hall',
        }),
        seq(d20(3), die(3, 2)),
      );
      expect(r.check?.outcome).toBe('failure');
      expect(r.effects).toContainEqual({ type: 'stamina', playerId: 'dana', delta: -2 });
      expect(r.effects).toContainEqual({ type: 'health', playerId: 'dana', delta: -2 });
      expect(r.effects).toContainEqual({ type: 'noise', delta: 3 });
      expect(r.facts.healthLost).toBe(2);
      expect(r.facts.staminaSpent).toBe(2);
    });
  });

  describe('check', () => {
    const search = adj({ intent: 'check', skill: 'scavenging', difficulty: 'routine', risk: 'low' });

    it('a successful search finds loot and uses up one search of the room', () => {
      const r = resolveAction(freshState(), 'walt', search, seq(d20(15), 0));
      expect(r.check?.outcome).toBe('success');
      expect(r.effects).toContainEqual({ type: 'item_gained', playerId: 'walt', templateId: 'granola_bar', quantity: 1 });
      expect(r.effects).toContainEqual({ type: 'loot_spent', locationId: 'front_office' });
      expect(r.facts.itemsFound).toEqual(['Granola Bar']);
    });

    it('a critical success finds two things', () => {
      const r = resolveAction(freshState(), 'walt', search, seq(d20(20), 0, 0.99));
      expect(r.facts.itemsFound).toEqual(['Granola Bar', 'Duct Tape']);
    });

    it('finds nothing once the room is picked clean', () => {
      const s = freshState();
      const empty: CampaignState = {
        ...s,
        locations: { ...s.locations, front_office: { ...s.locations.front_office, lootRemaining: 0 } },
      };
      const r = resolveAction(empty, 'walt', search, seq(d20(15), 0));
      expect(r.facts.lootExhausted).toBe(true);
      expect(find(r.effects, 'item_gained')).toBeUndefined();
      expect(find(r.effects, 'loot_spent')).toBeUndefined();
    });

    it('a failure can hurt, and a critical failure hurts more', () => {
      const risky = adj({ intent: 'check', skill: 'fighting', difficulty: 'hard', risk: 'moderate' });
      const fail = resolveAction(freshState(), 'dana', risky, seq(d20(2), die(3, 1)));
      expect(fail.effects).toContainEqual({ type: 'health', playerId: 'dana', delta: -1 });
      const crit = resolveAction(freshState(), 'dana', risky, seq(d20(1), die(3, 1)));
      expect(crit.check?.outcome).toBe('critical_failure');
      expect(crit.effects).toContainEqual({ type: 'health', playerId: 'dana', delta: -2 });
    });

    it('no risk means no damage, even on a failure', () => {
      const safe = adj({ intent: 'check', skill: 'awareness', risk: 'none' });
      const r = resolveAction(freshState(), 'dana', safe, seq(d20(2)));
      expect(r.check?.outcome).toBe('failure');
      expect(find(r.effects, 'health')).toBeUndefined();
    });

    it('reports real health lost and marks a character as down', () => {
      const s = setHealth(freshState(), 'dana', 1);
      const deadly = adj({ intent: 'check', skill: 'fighting', difficulty: 'very_hard', risk: 'severe' });
      const r = resolveAction(s, 'dana', deadly, seq(d20(2), die(4, 4))); // 4 + 1 = 5 damage
      expect(r.facts.healthLost).toBe(1); // she only had 1 to lose
      expect(r.facts.actorDown).toBe(true);
      expect(applyEffects(s, r.effects).characters.dana.health.current).toBe(0);
    });

    it('noise: quiet actions calm things, loud ones raise it, loud failures raise it more', () => {
      const quiet = resolveAction(freshState(), 'dana', adj({ intent: 'check', skill: 'awareness' }), seq(d20(15)));
      expect(quiet.effects).toContainEqual({ type: 'noise', delta: -1 });
      const loudWin = resolveAction(freshState(), 'dana', adj({ intent: 'check', skill: 'awareness', noisy: true }), seq(d20(15)));
      expect(loudWin.effects).toContainEqual({ type: 'noise', delta: 2 });
      const loudLoss = resolveAction(freshState(), 'dana', adj({ intent: 'check', skill: 'awareness', noisy: true }), seq(d20(2)));
      expect(loudLoss.effects).toContainEqual({ type: 'noise', delta: 3 });
    });

    it('a downed character cannot act', () => {
      const s = setHealth(freshState(), 'dana', 0);
      const r = resolveAction(s, 'dana', search);
      expect(r.effects).toEqual([]);
      expect(r.facts.refusedReason).toMatch(/down/);
    });

    it('throws for a player who does not exist', () => {
      expect(() => resolveAction(freshState(), 'nobody', search)).toThrow();
    });
  });

  describe('treat', () => {
    const hurtMarcus = () => setHealth(freshState(), 'marcus', 5);
    const treat = adj({ intent: 'treat', difficulty: 'routine', targetPlayerId: 'marcus' });

    it('needs medical supplies', () => {
      const r = resolveAction(setHealth(freshState(), 'dana', 5), 'marcus', { ...treat, targetPlayerId: 'dana' });
      expect(r.facts.refusedReason).toMatch(/no bandages/);
    });

    it('refuses to treat someone who is not hurt', () => {
      const r = resolveAction(freshState(), 'dana', { ...treat, targetPlayerId: undefined });
      expect(r.facts.refusedReason).toMatch(/not hurt/);
    });

    it('a successful treatment heals the target and uses up one supply', () => {
      const r = resolveAction(hurtMarcus(), 'dana', treat, seq(d20(15), die(4, 3)));
      expect(r.check?.skill).toBe('medicine');
      expect(r.check?.total).toBe(20); // 15 + 4 medicine + 1 trauma kit
      expect(r.effects).toContainEqual({ type: 'health', playerId: 'marcus', delta: 3 });
      expect(r.effects).toContainEqual({ type: 'item_consumed', playerId: 'dana', templateId: 'bandages', quantity: 1 });
      expect(r.facts.healthRestored).toBe(3);
    });

    it('a critical success heals extra and saves the supply', () => {
      const r = resolveAction(hurtMarcus(), 'dana', treat, seq(d20(20), die(4, 3)));
      expect(r.effects).toContainEqual({ type: 'health', playerId: 'marcus', delta: 5 });
      expect(find(r.effects, 'item_consumed')).toBeUndefined();
    });

    it('a failure wastes the supply and heals nothing', () => {
      const r = resolveAction(hurtMarcus(), 'dana', treat, seq(d20(2)));
      expect(find(r.effects, 'item_consumed')).toBeDefined();
      expect(find(r.effects, 'health')).toBeUndefined();
    });

    it('is always a Medicine check, whatever the Game Master asked for', () => {
      const r = resolveAction(hurtMarcus(), 'dana', { ...treat, skill: 'fighting' }, seq(d20(15), die(4, 1)));
      expect(r.check?.skill).toBe('medicine');
    });
  });
});

describe('applyEffect (the only way state changes)', () => {
  const s = freshState();

  it('clamps health and stamina between 0 and max', () => {
    expect(applyEffect(s, { type: 'health', playerId: 'dana', delta: -99 }).characters.dana.health.current).toBe(0);
    expect(applyEffect(s, { type: 'health', playerId: 'dana', delta: 99 }).characters.dana.health.current).toBe(10);
    expect(applyEffect(s, { type: 'stamina', playerId: 'dana', delta: -99 }).characters.dana.stamina.current).toBe(0);
    expect(applyEffect(s, { type: 'stamina', playerId: 'dana', delta: 99 }).characters.dana.stamina.current).toBe(8);
  });

  it('keeps noise between 0 and the maximum', () => {
    expect(applyEffect(s, { type: 'noise', delta: -99 }).noise).toBe(0);
    expect(applyEffect(s, { type: 'noise', delta: 99 }).noise).toBe(MAX_NOISE);
  });

  it('stacks items by template and removes them at zero', () => {
    const more = applyEffect(s, { type: 'item_gained', playerId: 'dana', templateId: 'bandages', quantity: 2 });
    expect(more.characters.dana.inventory.find((i) => i.templateId === 'bandages')?.quantity).toBe(5);
    const fresh = applyEffect(s, { type: 'item_gained', playerId: 'marcus', templateId: 'batteries', quantity: 1 });
    expect(fresh.characters.marcus.inventory.some((i) => i.templateId === 'batteries')).toBe(true);
    const gone = applyEffect(s, { type: 'item_consumed', playerId: 'marcus', templateId: 'whistle', quantity: 1 });
    expect(gone.characters.marcus.inventory.some((i) => i.templateId === 'whistle')).toBe(false);
  });

  it('moves only to places that exist', () => {
    expect(applyEffect(s, { type: 'move', to: 'gym' }).locationId).toBe('gym');
    expect(applyEffect(s, { type: 'move', to: 'narnia' }).locationId).toBe('front_office');
  });

  it('spends loot without going below zero, and never runs time backwards', () => {
    let t = s;
    for (let i = 0; i < 5; i++) t = applyEffect(t, { type: 'loot_spent', locationId: 'front_office' });
    expect(t.locations.front_office.lootRemaining).toBe(0);
    expect(applyEffect(s, { type: 'time', minutes: 15 }).clock).toBe(s.clock + 15);
    expect(applyEffect(s, { type: 'time', minutes: -15 }).clock).toBe(s.clock);
  });

  it('ignores effects aimed at unknown players', () => {
    expect(applyEffect(s, { type: 'health', playerId: 'nobody', delta: -5 })).toBe(s);
  });

  it('never mutates the state it is given', () => {
    const before = JSON.stringify(s);
    applyEffects(s, [
      { type: 'health', playerId: 'dana', delta: -3 },
      { type: 'item_gained', playerId: 'dana', templateId: 'bandages', quantity: 1 },
      { type: 'loot_spent', locationId: 'front_office' },
      { type: 'move', to: 'gym' },
    ]);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('describeEffect', () => {
  const s = freshState();
  it('describes damage, and flags a character going down', () => {
    expect(describeEffect(s, { type: 'health', playerId: 'dana', delta: -3 })).toBe('Dana Okafor loses 3 health (7/10)');
    expect(describeEffect(setHealth(s, 'dana', 2), { type: 'health', playerId: 'dana', delta: -5 })).toMatch(/DOWN/);
  });
  it('says nothing when nothing changed', () => {
    expect(describeEffect(s, { type: 'health', playerId: 'dana', delta: 5 })).toBeNull();
    expect(describeEffect(s, { type: 'time', minutes: 5 })).toBeNull();
  });
});
