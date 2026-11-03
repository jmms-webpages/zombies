/**
 * Local mock campaign: three survivors in the front office of a fictional
 * middle school. Everything here is plain data; it is the starting point that
 * the rules module then changes one validated effect at a time.
 */
import type { CampaignState, Character, Location, PlayerId, SkillId } from '../types';
import { SKILL_IDS } from '../types';
import { createItem } from '../game/items';

/** 3:20 PM on day 1, in minutes since midnight. */
const START_CLOCK = 15 * 60 + 20;

function skills(overrides: Partial<Record<SkillId, number>>): Record<SkillId, number> {
  const base = Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>;
  return { ...base, ...overrides };
}

const CHARACTERS: Character[] = [
  {
    id: 'dana',
    name: 'Dana Okafor',
    background: 'School nurse. Eleven years of scraped knees and one very long Friday.',
    health: { current: 10, max: 10 },
    stamina: { current: 8, max: 8 },
    skills: skills({ medicine: 4, awareness: 2, stealth: 1, scavenging: 1, fighting: -1 }),
    inventory: [
      createItem('first_aid_kit'),
      createItem('bandages', 3),
      createItem('gauze', 2),
      createItem('trauma_shears'),
      createItem('granola_bar'),
    ],
  },
  {
    id: 'marcus',
    name: 'Marcus Hale',
    background: 'PE teacher and varsity coach. Built like a door, sounds like a drill sergeant.',
    health: { current: 12, max: 12 },
    stamina: { current: 10, max: 10 },
    skills: skills({ fighting: 3, athletics: 3, awareness: 1, stealth: -1, tech: -1 }),
    inventory: [createItem('aluminum_bat'), createItem('whistle'), createItem('bottled_water', 2)],
  },
  {
    id: 'walt',
    name: 'Walt Brennan',
    background: 'Night custodian who came in early. Knows every locked door in the building.',
    health: { current: 10, max: 10 },
    stamina: { current: 8, max: 8 },
    skills: skills({ scavenging: 3, tech: 2, stealth: 2, fighting: 1, awareness: 1, medicine: -1 }),
    inventory: [
      createItem('master_keys'),
      createItem('pipe_wrench'),
      createItem('flashlight'),
      createItem('multitool'),
      createItem('duct_tape'),
    ],
  },
];

function location(
  l: Omit<Location, 'lootInitial' | 'lootRemaining'> & { loot: number },
): Location {
  const { loot, ...rest } = l;
  return { ...rest, lootInitial: loot, lootRemaining: loot };
}

const LOCATIONS: Location[] = [
  location({
    id: 'front_office',
    name: 'Front Office',
    description:
      'A counter, a dead phone, and a glass door you have wedged shut with a filing cabinet. The fluorescent tube overhead flickers like a pulse.',
    aliases: ['front office', 'main office', 'office', 'attendance', 'secretary'],
    dangerLevel: 2,
    exits: ['main_hall'],
    lootTable: [
      { templateId: 'granola_bar', weight: 3 },
      { templateId: 'batteries', weight: 2 },
      { templateId: 'duct_tape', weight: 1 },
    ],
    loot: 2,
  }),
  location({
    id: 'main_hall',
    name: 'Main Hallway',
    description:
      'A long corridor of dented lockers. Backpacks lie where they were dropped. Something wet has dried in a trail toward the east wing.',
    aliases: ['main hallway', 'hallway', 'hall', 'halls', 'corridor', 'lockers'],
    dangerLevel: 4,
    exits: ['front_office', 'cafeteria', 'gym', 'library', 'science_lab', 'nurses_office'],
    lootTable: [
      { templateId: 'bottled_water', weight: 3 },
      { templateId: 'granola_bar', weight: 3 },
      { templateId: 'fire_axe', weight: 1 },
    ],
    loot: 3,
  }),
  location({
    id: 'cafeteria',
    name: 'Cafeteria',
    description:
      'Trays still on the tables. The serving line is a steel canyon; the walk-in cooler hums, which means the power is still on somewhere.',
    aliases: ['cafeteria', 'lunchroom', 'kitchen', 'cafe', 'lunch room'],
    dangerLevel: 3,
    exits: ['main_hall'],
    lootTable: [
      { templateId: 'canned_soup', weight: 4 },
      { templateId: 'bottled_water', weight: 3 },
      { templateId: 'granola_bar', weight: 2 },
    ],
    loot: 4,
  }),
  location({
    id: 'gym',
    name: 'Gymnasium',
    description:
      'Bleachers pulled halfway out. Basketballs rolled into the corners. The echo makes every footstep sound like two people.',
    aliases: ['gymnasium', 'gym', 'locker room', 'bleachers'],
    dangerLevel: 3,
    exits: ['main_hall'],
    lootTable: [
      { templateId: 'aluminum_bat', weight: 2 },
      { templateId: 'bottled_water', weight: 3 },
      { templateId: 'duct_tape', weight: 2 },
    ],
    loot: 3,
  }),
  location({
    id: 'library',
    name: 'Library',
    description:
      'Quiet in the old way. Beanbags, a returns cart, and a window onto the parking lot where the buses never left.',
    aliases: ['library', 'media center', 'books'],
    dangerLevel: 2,
    exits: ['main_hall'],
    lootTable: [
      { templateId: 'batteries', weight: 2 },
      { templateId: 'flashlight', weight: 1 },
      { templateId: 'granola_bar', weight: 2 },
    ],
    loot: 2,
  }),
  location({
    id: 'science_lab',
    name: 'Science Lab',
    description:
      'Black countertops, gas valves, and a skeleton model posed with a hall pass. One of the cabinets has been forced open from inside.',
    aliases: ['science lab', 'science room', 'science', 'laboratory', 'lab', 'chem lab'],
    dangerLevel: 4,
    exits: ['main_hall'],
    lootTable: [
      { templateId: 'gauze', weight: 2 },
      { templateId: 'batteries', weight: 3 },
      { templateId: 'multitool', weight: 1 },
    ],
    loot: 3,
  }),
  location({
    id: 'nurses_office',
    name: 'Nurse’s Office',
    description:
      'Two cots, a scale, a poster about handwashing. The supply cabinet is half-open and someone has been through it in a hurry.',
    aliases: ['nurse’s office', 'nurse\'s office', 'nurses office', 'nurse', 'infirmary', 'clinic', 'sick room'],
    dangerLevel: 2,
    exits: ['main_hall'],
    lootTable: [
      { templateId: 'bandages', weight: 4 },
      { templateId: 'gauze', weight: 3 },
      { templateId: 'trauma_shears', weight: 1 },
    ],
    loot: 3,
  }),
];

const INTRO =
  'Day one. The bell never rang. At 2:50 the PA crackled, shrieked, and died; by 3:05 the screaming in the east wing had stopped, which was worse. ' +
  'Three adults — a nurse, a coach, a custodian — are barricaded in the front office of Maple Ridge Middle School with a dead phone, a flickering light, and a door that thumps every few minutes. ' +
  'Beyond the glass the hallway is quiet. It will not stay that way.';

/** A fresh campaign. `now` is injectable so tests get stable timestamps. */
export function createMockCampaign(now: () => number = Date.now): CampaignState {
  const ts = now();
  const characters = Object.fromEntries(CHARACTERS.map((c) => [c.id, structuredClone(c)]));
  const locations = Object.fromEntries(LOCATIONS.map((l) => [l.id, structuredClone(l)]));
  const partyOrder: PlayerId[] = CHARACTERS.map((c) => c.id);

  return {
    schemaVersion: 1,
    id: 'mock-campaign-1',
    title: 'Maple Ridge Middle School',
    clock: START_CLOCK,
    locationId: 'front_office',
    locations,
    characters,
    partyOrder,
    noise: 1,
    objectives: [
      { id: 'night', text: 'Survive until morning.', status: 'active' },
      { id: 'radio', text: 'Find a working radio or a way to call for help.', status: 'active' },
      { id: 'supplies', text: 'Gather food, water and medical supplies.', status: 'active' },
    ],
    events: [
      { id: 'evt-1', kind: 'narration', text: INTRO, at: START_CLOCK, ts },
      {
        id: 'evt-2',
        kind: 'system',
        text: 'Campaign started. Scripted Game Master active (no AI connected).',
        at: START_CLOCK,
        ts,
      },
    ],
    nextEventSeq: 3,
  };
}
