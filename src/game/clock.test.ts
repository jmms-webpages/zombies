import { describe, expect, it } from 'vitest';
import { clockParts, formatClock, formatTime, timePhase } from './clock';

describe('clock', () => {
  it('formats 12-hour times', () => {
    expect(formatTime(15 * 60 + 20)).toBe('3:20 PM');
    expect(formatTime(0)).toBe('12:00 AM');
    expect(formatTime(12 * 60)).toBe('12:00 PM');
    expect(formatTime(9 * 60 + 5)).toBe('9:05 AM');
  });

  it('counts days from 1 and rolls over at midnight', () => {
    expect(formatClock(15 * 60 + 20)).toBe('Day 1, 3:20 PM');
    expect(formatClock(24 * 60 + 5)).toBe('Day 2, 12:05 AM');
    expect(clockParts(2 * 24 * 60 + 61)).toEqual({ day: 3, hour: 1, minute: 1 });
  });

  it('names the phase of the day', () => {
    expect(timePhase(5 * 60)).toBe('Dawn');
    expect(timePhase(9 * 60)).toBe('Morning');
    expect(timePhase(15 * 60)).toBe('Afternoon');
    expect(timePhase(18 * 60)).toBe('Dusk');
    expect(timePhase(23 * 60)).toBe('Night');
    expect(timePhase(3 * 60)).toBe('Night');
  });
});
