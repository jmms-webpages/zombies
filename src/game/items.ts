import type { Item } from '../types';

/** Every item that can exist in the game. Loot tables and characters refer to these by id. */
export const ITEM_CATALOG: Record<string, Omit<Item, 'quantity'>> = {
  aluminum_bat: {
    templateId: 'aluminum_bat',
    name: 'Aluminum Bat',
    description: 'Dented from a hundred softball practices.',
    kind: 'weapon',
    bonus: { skill: 'fighting', value: 1 },
  },
  pipe_wrench: {
    templateId: 'pipe_wrench',
    name: 'Pipe Wrench',
    description: 'Heavy, ugly, and it does not need batteries.',
    kind: 'weapon',
    bonus: { skill: 'fighting', value: 1 },
  },
  fire_axe: {
    templateId: 'fire_axe',
    name: 'Fire Axe',
    description: 'Pried from its glass case. It was meant for emergencies.',
    kind: 'weapon',
    bonus: { skill: 'fighting', value: 2 },
  },
  flashlight: {
    templateId: 'flashlight',
    name: 'Flashlight',
    description: 'The beam is steady. For now.',
    kind: 'tool',
    bonus: { skill: 'awareness', value: 1 },
  },
  multitool: {
    templateId: 'multitool',
    name: 'Multitool',
    description: 'Pliers, screwdriver, a tiny saw.',
    kind: 'tool',
    bonus: { skill: 'tech', value: 1 },
  },
  first_aid_kit: {
    templateId: 'first_aid_kit',
    name: 'Trauma Kit',
    description: 'A proper kit. Makes careful work easier, but it is not used up.',
    kind: 'tool',
    bonus: { skill: 'medicine', value: 1 },
  },
  trauma_shears: {
    templateId: 'trauma_shears',
    name: 'Trauma Shears',
    description: 'Cuts through clothing, belts, and bad news.',
    kind: 'tool',
  },
  whistle: {
    templateId: 'whistle',
    name: 'Coach’s Whistle',
    description: 'Please never blow it.',
    kind: 'tool',
  },
  master_keys: {
    templateId: 'master_keys',
    name: 'Master Keys',
    description: 'A heavy ring that opens most doors in the building.',
    kind: 'key',
  },
  bandages: {
    templateId: 'bandages',
    name: 'Bandages',
    description: 'Used when treating wounds. Each treatment uses one.',
    kind: 'medical',
  },
  gauze: {
    templateId: 'gauze',
    name: 'Sterile Gauze',
    description: 'Used when treating wounds. Each treatment uses one.',
    kind: 'medical',
  },
  granola_bar: {
    templateId: 'granola_bar',
    name: 'Granola Bar',
    description: 'Slightly crushed, entirely edible.',
    kind: 'food',
  },
  bottled_water: {
    templateId: 'bottled_water',
    name: 'Bottled Water',
    description: 'Cold from the vending machine, once.',
    kind: 'food',
  },
  canned_soup: {
    templateId: 'canned_soup',
    name: 'Canned Soup',
    description: 'Cafeteria stock. No can opener yet.',
    kind: 'food',
  },
  batteries: {
    templateId: 'batteries',
    name: 'Batteries',
    description: 'A pack of AAs. Worth more than money now.',
    kind: 'misc',
  },
  duct_tape: {
    templateId: 'duct_tape',
    name: 'Duct Tape',
    description: 'It holds the world together.',
    kind: 'misc',
  },
};

export function createItem(templateId: string, quantity = 1): Item {
  const template = ITEM_CATALOG[templateId];
  if (!template) throw new Error(`Unknown item template "${templateId}".`);
  return { ...template, quantity };
}

/** The best single passive bonus a set of items gives to a skill. Bonuses do not stack. */
export function bestItemBonus(items: readonly Item[], skill: string): number {
  let best = 0;
  for (const item of items) {
    if (item.quantity > 0 && item.bonus && item.bonus.skill === skill) {
      best = Math.max(best, item.bonus.value);
    }
  }
  return best;
}
