import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../types';
import { MAX_ACTION_LENGTH, appendEvent, buildContext, isPartyWiped, processAction } from './engine';
import { ScriptedGameMaster } from '../gm/scriptedGameMaster';
import { d20, die, freshState, seq, setHealth, stubGm } from '../test/helpers';

const NOW = () => 5_000;
const kinds = (events: readonly GameEvent[]) => events.map((e) => e.kind);

describe('processAction: the full pipeline', () => {
  it('turns "search the room" into a roll, loot, state changes and a story beat, in order', async () => {
    const before = freshState();
    const after = await processAction(before, 'walt', 'Search the front office for supplies', {
      gm: new ScriptedGameMaster({ rng: seq(0) }),
      rng: seq(d20(15), 0),
      now: NOW,
    });

    const added = after.events.slice(before.events.length);
    expect(kinds(added)).toEqual(['player_action', 'system', 'check', 'effect', 'effect', 'narration']);
    expect(added.every((e) => e.ts === 5_000)).toBe(true);

    const check = added.find((e) => e.kind === 'check');
    expect(check && check.kind === 'check' && check.check.outcome).toBe('success');

    expect(after.characters.walt.inventory.some((i) => i.templateId === 'granola_bar')).toBe(true);
    expect(after.locations.front_office.lootRemaining).toBe(before.locations.front_office.lootRemaining - 1);
    expect(after.clock).toBe(before.clock + 15);
    // Other survivors are untouched.
    expect(after.characters.dana).toEqual(before.characters.dana);
    expect(after.characters.marcus).toEqual(before.characters.marcus);
  });

  it('never mutates the state it was given', async () => {
    const before = freshState();
    const snapshot = JSON.stringify(before);
    await processAction(before, 'walt', 'search the office', {
      gm: new ScriptedGameMaster(),
      rng: seq(d20(15), 0),
      now: NOW,
    });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('numbers smuggled in by a Game Master change nothing', async () => {
    const hurt = setHealth(freshState(), 'marcus', 5);
    const gm = stubGm(() => ({
      intent: 'check',
      skill: 'fighting',
      difficulty: 'easy',
      risk: 'none',
      exertion: 'light',
      noisy: false,
      rationale: 'trust me',
      damage: 999,
      health: { current: 999 },
      effects: [{ type: 'health', playerId: 'marcus', delta: 100 }],
    }));
    const after = await processAction(hurt, 'marcus', 'punch a zombie', { gm, rng: seq(d20(15)), now: NOW });
    expect(after.characters.marcus.health.current).toBe(5);
  });

  it('a Game Master that tries to edit the state it was shown cannot', async () => {
    const before = freshState();
    const gm = stubGm((ctx) => {
      (ctx.actor.health as { current: number }).current = 999;
      return { intent: 'talk' };
    });
    const after = await processAction(before, 'dana', 'hello', { gm, now: NOW });
    expect(after.characters.dana.health.current).toBe(10);
    expect(before.characters.dana.health.current).toBe(10);
    const sys = after.events.filter((e) => e.kind === 'system');
    expect(sys.some((e) => e.kind === 'system' && /could not rule/.test(e.text))).toBe(true);
  });

  it('hands the Game Master a frozen copy, not the live state', () => {
    const state = freshState();
    const ctx = buildContext(state, 'dana');
    expect(ctx.actor).toEqual(state.characters.dana);
    expect(ctx.actor === state.characters.dana).toBe(false);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.actor.health)).toBe(true);
    expect(Object.isFrozen(ctx.location)).toBe(true);
  });

  it('a Game Master that throws degrades to "nothing happens", and the game goes on', async () => {
    const gm = stubGm(() => {
      throw new Error('network down');
    });
    const before = freshState();
    const after = await processAction(before, 'dana', 'search the office', { gm, now: NOW });
    expect(after.events.some((e) => e.kind === 'system' && /could not rule/.test(e.text))).toBe(true);
    expect(after.events[after.events.length - 1].kind).toBe('narration');
    expect(after.characters.dana).toEqual(before.characters.dana);
  });

  it('a failing or over-long narration is replaced or trimmed', async () => {
    const broken = stubGm(() => ({ intent: 'talk' }), async () => {
      throw new Error('boom');
    });
    const a = await processAction(freshState(), 'dana', 'hello', { gm: broken, now: NOW });
    const last = a.events[a.events.length - 1];
    expect(last.kind === 'narration' && last.text.length > 0).toBe(true);

    const wordy = stubGm(() => ({ intent: 'talk' }), async () => 'x'.repeat(10_000));
    const b = await processAction(freshState(), 'dana', 'hello', { gm: wordy, now: NOW });
    const lastB = b.events[b.events.length - 1];
    expect(lastB.kind === 'narration' && lastB.text.length).toBe(2000);
  });
});

describe('processAction: input handling', () => {
  const gm = new ScriptedGameMaster();

  it('ignores empty input, unknown players and a finished campaign', async () => {
    const s = freshState();
    expect(await processAction(s, 'dana', '   ', { gm })).toBe(s);
    expect(await processAction(s, 'nobody', 'hello', { gm })).toBe(s);
    const wiped = setHealth(setHealth(setHealth(s, 'dana', 0), 'marcus', 0), 'walt', 0);
    expect(isPartyWiped(wiped)).toBe(true);
    expect(await processAction(wiped, 'dana', 'hello', { gm })).toBe(wiped);
  });

  it('collapses whitespace and caps the length of what a player types', async () => {
    const a = await processAction(freshState(), 'dana', '  say   hello\n there ', { gm, now: NOW });
    const first = a.events.find((e) => e.kind === 'player_action');
    expect(first && first.kind === 'player_action' && first.text).toBe('say hello there');

    const b = await processAction(freshState(), 'dana', 'a'.repeat(MAX_ACTION_LENGTH + 100), { gm, now: NOW });
    const long = b.events.find((e) => e.kind === 'player_action');
    expect(long && long.kind === 'player_action' && long.text.length).toBe(MAX_ACTION_LENGTH);
  });

  it('reports progress as soon as the action is on the record', async () => {
    const seen: GameEvent['kind'][][] = [];
    await processAction(freshState(), 'dana', 'hello', {
      gm,
      now: NOW,
      onProgress: (s) => seen.push(kinds(s.events.slice(2))),
    });
    expect(seen).toEqual([['player_action']]);
  });

  it('declares the campaign over when the last survivor goes down', async () => {
    let s = setHealth(setHealth(freshState(), 'marcus', 0), 'walt', 0);
    s = setHealth(s, 'dana', 1);
    const deadly = stubGm(() => ({
      intent: 'check',
      skill: 'fighting',
      difficulty: 'very_hard',
      risk: 'severe',
      exertion: 'light',
      noisy: false,
      rationale: 'overwhelmed',
    }));
    const after = await processAction(s, 'dana', 'fight them all', { gm: deadly, rng: seq(d20(2), die(4, 2)), now: NOW });
    expect(isPartyWiped(after)).toBe(true);
    expect(after.events.some((e) => e.kind === 'system' && /campaign is over/.test(e.text))).toBe(true);
  });
});

describe('events and context', () => {
  it('appendEvent numbers events one after another', () => {
    let s = freshState();
    s = appendEvent(s, { kind: 'system', text: 'a' }, 1);
    s = appendEvent(s, { kind: 'system', text: 'b' }, 2);
    const ids = s.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[ids.length - 1]).toBe('evt-4');
    expect(s.nextEventSeq).toBe(5);
  });

  it('the Game Master sees the exits and only the most recent events', () => {
    let s = freshState();
    for (let i = 0; i < 12; i++) s = appendEvent(s, { kind: 'system', text: `n${i}` }, 1);
    const ctx = buildContext(s, 'dana');
    expect(ctx.exits).toEqual([{ id: 'main_hall', name: 'Main Hallway' }]);
    expect(ctx.recentEvents).toHaveLength(8);
    expect(ctx.clockLabel).toBe('Day 1, 3:20 PM');
    expect(ctx.party).toHaveLength(3);
  });
});
