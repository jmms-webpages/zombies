import { describe, expect, it } from 'vitest';
import { suggestActions } from './suggestions';
import { freshState, moveTo, setHealth, setStamina } from '../test/helpers';

describe('suggestActions', () => {
  it('offers a search, a listen and the way out', () => {
    const list = suggestActions(freshState(), 'dana');
    expect(list).toContain('Search the front office for supplies');
    expect(list).toContain('Listen carefully for movement');
    expect(list).toContain('Quietly go to the Main Hallway');
  });

  it('stops suggesting a search once the room is picked clean', () => {
    const s = freshState();
    const empty = { ...s, locations: { ...s.locations, front_office: { ...s.locations.front_office, lootRemaining: 0 } } };
    expect(suggestActions(empty, 'dana').some((t) => t.startsWith('Search'))).toBe(false);
  });

  it('suggests first aid only when someone is hurt and you have supplies', () => {
    const s = freshState();
    expect(suggestActions(s, 'dana').some((t) => /Bandage/.test(t))).toBe(false);
    const hurt = setHealth(s, 'marcus', 4);
    expect(suggestActions(hurt, 'dana')).toContain("Bandage Marcus's wounds");
    expect(suggestActions(hurt, 'marcus').some((t) => /Bandage/.test(t))).toBe(false); // Marcus has no supplies
  });

  it('suggests rest only in a safe place when tired', () => {
    const tired = setStamina(freshState(), 'dana', 2);
    expect(suggestActions(tired, 'dana')).toContain('Rest and catch my breath');
    expect(suggestActions(moveTo(tired, 'main_hall'), 'dana')).not.toContain('Rest and catch my breath');
    expect(suggestActions(freshState(), 'dana')).not.toContain('Rest and catch my breath');
  });

  it('offers nothing to a downed or unknown player', () => {
    expect(suggestActions(setHealth(freshState(), 'dana', 0), 'dana')).toEqual([]);
    expect(suggestActions(freshState(), 'nobody')).toEqual([]);
  });
});
