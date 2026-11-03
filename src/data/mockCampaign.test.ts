import { describe, expect, it } from 'vitest';
import { SKILL_IDS } from '../types';
import { ITEM_CATALOG } from '../game/items';
import { createMockCampaign } from './mockCampaign';

describe('mock campaign data', () => {
  const state = createMockCampaign(() => 1);

  it('has three survivors with sane stats', () => {
    expect(state.partyOrder).toHaveLength(3);
    for (const id of state.partyOrder) {
      const c = state.characters[id];
      expect(c.id).toBe(id);
      expect(c.health.current).toBe(c.health.max);
      expect(c.stamina.current).toBe(c.stamina.max);
      for (const skill of SKILL_IDS) {
        expect(c.skills[skill]).toBeGreaterThanOrEqual(-1);
        expect(c.skills[skill]).toBeLessThanOrEqual(4);
      }
    }
  });

  it('has a consistent map: the start exists, every exit exists, and every exit can be walked back', () => {
    expect(state.locations[state.locationId]).toBeDefined();
    for (const loc of Object.values(state.locations)) {
      for (const exit of loc.exits) {
        expect(state.locations[exit]).toBeDefined();
        expect(state.locations[exit].exits).toContain(loc.id);
      }
    }
  });

  it('only refers to items that exist', () => {
    const templates = (items: { templateId: string }[]) => items.map((i) => i.templateId);
    for (const loc of Object.values(state.locations)) {
      for (const t of templates(loc.lootTable)) expect(ITEM_CATALOG[t]).toBeDefined();
    }
    for (const c of Object.values(state.characters)) {
      for (const t of templates(c.inventory)) expect(ITEM_CATALOG[t]).toBeDefined();
    }
  });

  it('hands out independent copies', () => {
    const a = createMockCampaign(() => 1);
    const b = createMockCampaign(() => 1);
    a.characters.dana.health.current = 1;
    a.locations.gym.lootRemaining = 0;
    expect(b.characters.dana.health.current).toBe(10);
    expect(b.locations.gym.lootRemaining).toBeGreaterThan(0);
  });

  it('starts with unique event ids and a matching sequence counter', () => {
    const ids = state.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.nextEventSeq).toBe(ids.length + 1);
  });
});
