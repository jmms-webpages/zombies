/**
 * Dice. Pure TypeScript, no UI or Firebase imports.
 *
 * Every function that rolls takes an `Rng` so tests can supply a fixed
 * sequence. The default is the browser/Node Web Crypto RNG.
 */

/** Returns a number in [0, 1), like Math.random. */
export type Rng = () => number;

export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
};

/** Small deterministic PRNG for tests and replays. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roll one die with `sides` sides. Returns 1..sides. */
export function rollDie(sides: number, rng: Rng = cryptoRng): number {
  if (!Number.isInteger(sides) || sides < 2) {
    throw new RangeError(`A die needs at least 2 sides (got ${sides}).`);
  }
  return Math.floor(rng() * sides) + 1;
}

export function rollD20(rng: Rng = cryptoRng): number {
  return rollDie(20, rng);
}

/** Roll `count` dice and add them. e.g. rollDice(2, 6) is 2d6. */
export function rollDice(count: number, sides: number, rng: Rng = cryptoRng): number {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`Dice count must be a non-negative integer (got ${count}).`);
  }
  let total = 0;
  for (let i = 0; i < count; i++) total += rollDie(sides, rng);
  return total;
}

/** Pick one entry from a weighted list. */
export function pickWeighted<T extends { weight: number }>(
  entries: readonly T[],
  rng: Rng = cryptoRng,
): T | undefined {
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const entry of entries) {
    r -= Math.max(0, entry.weight);
    if (r < 0) return entry;
  }
  return entries[entries.length - 1];
}

/** Pick one entry uniformly. */
export function pick<T>(items: readonly T[], rng: Rng = cryptoRng): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list.');
  return items[Math.floor(rng() * items.length)];
}
