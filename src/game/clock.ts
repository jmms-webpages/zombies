/** In-game time. The clock is a single number: minutes since midnight of day 1. */

export const MINUTES_PER_DAY = 24 * 60;

export type TimePhase = 'Dawn' | 'Morning' | 'Afternoon' | 'Dusk' | 'Night';

export function clockParts(minutes: number): { day: number; hour: number; minute: number } {
  const day = Math.floor(minutes / MINUTES_PER_DAY) + 1;
  const ofDay = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { day, hour: Math.floor(ofDay / 60), minute: ofDay % 60 };
}

/** "7:40 AM" */
export function formatTime(minutes: number): string {
  const { hour, minute } = clockParts(minutes);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** "Day 1, 7:40 AM" */
export function formatClock(minutes: number): string {
  return `Day ${clockParts(minutes).day}, ${formatTime(minutes)}`;
}

export function timePhase(minutes: number): TimePhase {
  const { hour } = clockParts(minutes);
  if (hour >= 5 && hour < 7) return 'Dawn';
  if (hour >= 7 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 20) return 'Dusk';
  return 'Night';
}
