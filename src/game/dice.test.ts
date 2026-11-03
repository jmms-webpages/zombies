import { describe, expect, it } from 'vitest';
import { cryptoRng, pick, pickWeighted, rollD20, rollDice, rollDie, seededRng } from './dice';
import { d20, seq } from '../test/helpers';

describe('rollDie / rollD20', () => {
  it('maps the rng range onto 1..sides', () => {
    expect(rollDie(20, seq(0))).toBe(1);
    expect(rollDie(20, seq(0.999999))).toBe(20);
    expect(rollDie(6, seq(0.5))).toBe(4);
  });

  it('only ever produces values in range, and reaches both ends', () => {
    const rng = seededRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const n = rollD20(rng);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(20);
      seen.add(n);
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(20)).toBe(true);
    expect(seen.size).toBe(20);
  });

  it('the d20 test helper really produces the number asked for', () => {
    for (let n = 1; n <= 20; n++) expect(rollD20(seq(d20(n)))).toBe(n);
  });

  it('rejects dice that cannot exist', () => {
    expect(() => rollDie(1)).toThrow(RangeError);
    expect(() => rollDie(0)).toThrow(RangeError);
    expect(() => rollDie(2.5)).toThrow(RangeError);
  });
});

describe('rollDice', () => {
  it('adds the dice together', () => {
    // Three d6 showing 1, 4 and 6.
    expect(rollDice(3, 6, seq(0, 0.5, 0.99))).toBe(11);
  });
  it('rolling zero dice is zero, and a negative count is an error', () => {
    expect(rollDice(0, 6)).toBe(0);
    expect(() => rollDice(-1, 6)).toThrow(RangeError);
  });
});

describe('seededRng', () => {
  it('is repeatable and stays inside [0, 1)', () => {
    const a = seededRng(7);
    const b = seededRng(7);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('cryptoRng', () => {
  it('returns numbers in [0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const x = cryptoRng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('pickWeighted / pick', () => {
  const entries = [
    { id: 'a', weight: 3 },
    { id: 'b', weight: 2 },
    { id: 'c', weight: 1 },
  ];

  it('follows the weights', () => {
    expect(pickWeighted(entries, seq(0))?.id).toBe('a');
    expect(pickWeighted(entries, seq(0.49))?.id).toBe('a'); // 0.49 * 6 = 2.94, inside a's 3
    expect(pickWeighted(entries, seq(0.51))?.id).toBe('b'); // 3.06
    expect(pickWeighted(entries, seq(0.99))?.id).toBe('c');
  });

  it('returns nothing when there is nothing to pick', () => {
    expect(pickWeighted([], seq(0))).toBeUndefined();
    expect(pickWeighted([{ id: 'x', weight: 0 }], seq(0))).toBeUndefined();
  });

  it('ignores negative weights', () => {
    expect(pickWeighted([{ id: 'x', weight: -5 }, { id: 'y', weight: 1 }], seq(0.9))?.id).toBe('y');
  });

  it('pick chooses uniformly and rejects an empty list', () => {
    expect(pick(['x', 'y', 'z'], seq(0.99))).toBe('z');
    expect(() => pick([])).toThrow(RangeError);
  });
});
