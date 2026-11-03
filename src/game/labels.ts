import type { CheckOutcome, DifficultyId, SkillId } from '../types';

export const SKILL_LABELS: Record<SkillId, string> = {
  fighting: 'Fighting',
  stealth: 'Stealth',
  scavenging: 'Scavenging',
  medicine: 'Medicine',
  athletics: 'Athletics',
  tech: 'Tech',
  awareness: 'Awareness',
};

export const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  easy: 'Easy',
  routine: 'Routine',
  hard: 'Hard',
  very_hard: 'Very hard',
  extreme: 'Extreme',
};

export const OUTCOME_LABELS: Record<CheckOutcome, string> = {
  critical_success: 'Critical success',
  success: 'Success',
  failure: 'Failure',
  critical_failure: 'Critical failure',
};

/** "+3" / "−1" / "+0" */
export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

export function noiseLabel(noise: number): string {
  if (noise <= 1) return 'Silent';
  if (noise <= 4) return 'Quiet';
  if (noise <= 7) return 'Uneasy';
  return 'They are coming';
}
