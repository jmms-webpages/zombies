import { describe, expect, it } from 'vitest';
import type { PlayerAction, PlayerId } from '../types';
import { ScriptedGameMaster, findLocationInText } from './scriptedGameMaster';
import { buildContext } from '../game/engine';
import { resolveAction, sanitizeAdjudication } from '../game/rules';
import { d20, freshState, seq } from '../test/helpers';

const gm = new ScriptedGameMaster({ rng: seq(0) });
const act = (playerId: PlayerId, text: string): PlayerAction => ({ id: 'a1', playerId, text, submittedAt: 0 });
const rule = (playerId: PlayerId, text: string) => gm.adjudicate(buildContext(freshState(), playerId), act(playerId, text));

describe('findLocationInText', () => {
  const locations = Object.values(freshState().locations);
  it('finds a place by name or alias, preferring the longest match', () => {
    expect(findLocationInText('head to the main hallway', locations)?.id).toBe('main_hall');
    expect(findLocationInText('into the hall', locations)?.id).toBe('main_hall');
    expect(findLocationInText("go to the nurse's office", locations)?.id).toBe('nurses_office');
    expect(findLocationInText('check the lab', locations)?.id).toBe('science_lab');
  });
  it('matches whole words only and returns nothing for unknown places', () => {
    expect(findLocationInText('I walk to the moon', locations)).toBeUndefined();
    expect(findLocationInText('the shall not pass', locations)).toBeUndefined();
  });
});

describe('ScriptedGameMaster.adjudicate', () => {
  it('treats wounds, and finds the patient by first name', async () => {
    const a = await rule('dana', 'Bandage Marcus');
    expect(a).toMatchObject({ intent: 'treat', skill: 'medicine', targetPlayerId: 'marcus' });
    expect(await rule('dana', 'bandage my wounds')).toMatchObject({ intent: 'treat' });
  });

  it('rests', async () => {
    expect(await rule('dana', 'I rest for a while')).toMatchObject({ intent: 'rest' });
  });

  it('moves, sneaking or sprinting as asked', async () => {
    expect(await rule('dana', 'Quietly go to the Main Hallway')).toMatchObject({
      intent: 'move',
      destinationId: 'main_hall',
      skill: 'stealth',
      difficulty: 'hard',
      risk: 'moderate',
    });
    expect(await rule('dana', 'sprint to the hallway')).toMatchObject({
      intent: 'move',
      skill: 'athletics',
      exertion: 'heavy',
      noisy: true,
    });
  });

  it('turns skill words into checks and loud words into noise', async () => {
    expect(await rule('walt', 'Search the room')).toMatchObject({ intent: 'check', skill: 'scavenging' });
    expect(await rule('walt', 'Listen at the door')).toMatchObject({ intent: 'check', skill: 'awareness' });
    expect(await rule('marcus', 'smash the window')).toMatchObject({ intent: 'check', skill: 'fighting', noisy: true });
  });

  it('treats anything else as talk, including a trip to a place that does not exist', async () => {
    expect(await rule('dana', 'hello everyone')).toMatchObject({ intent: 'talk' });
    expect(await rule('dana', 'go to the moon')).toMatchObject({ intent: 'talk' });
  });

  it('always returns something the rules module accepts as-is', async () => {
    const state = freshState();
    for (const text of ['search', 'sprint to the gym', 'bandage Marcus', 'rest', 'shout!', '???', '']) {
      const raw = await gm.adjudicate(buildContext(state, 'dana'), act('dana', text));
      // Sanitising must not downgrade or rewrite what the scripted GM proposed.
      expect(sanitizeAdjudication(raw, state).intent).toBe(raw.intent);
    }
  });
});

describe('ScriptedGameMaster.narrate', () => {
  it('describes a successful search, naming the actor and the loot', async () => {
    const state = freshState();
    const adjudication = sanitizeAdjudication(await rule('walt', 'Search the room'), state);
    const resolution = resolveAction(state, 'walt', adjudication, seq(d20(15), 0));
    const text = await gm.narrate(buildContext(state, 'walt'), act('walt', 'Search the room'), resolution);
    expect(text).toContain('Walt Brennan');
    expect(text).toContain('Found: Granola Bar.');
  });

  it('passes a refusal through as the story', async () => {
    const state = freshState();
    const adjudication = sanitizeAdjudication({ intent: 'move', destinationId: 'cafeteria' }, state);
    const resolution = resolveAction(state, 'dana', adjudication);
    const text = await gm.narrate(buildContext(state, 'dana'), act('dana', 'go to the cafeteria'), resolution);
    expect(text).toMatch(/cannot reach the Cafeteria/);
  });

  it('mentions damage taken', async () => {
    const state = freshState();
    const adjudication = sanitizeAdjudication(
      { intent: 'check', skill: 'fighting', difficulty: 'hard', risk: 'moderate' },
      state,
    );
    const resolution = resolveAction(state, 'dana', adjudication, seq(d20(2), 0));
    const text = await gm.narrate(buildContext(state, 'dana'), act('dana', 'fight'), resolution);
    expect(text).toMatch(/loses 1 health/);
  });
});
