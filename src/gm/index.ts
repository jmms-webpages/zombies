/**
 * The one place that decides which Game Master the app uses.
 *
 * To move to Claude later, write a class that implements `GameMaster` (see
 * `src/types`) whose `adjudicate`/`narrate` call a SERVER-SIDE endpoint (for
 * example a Cloud Function or Cloud Run service) that holds the API key, and
 * return it from here. Nothing else in the app needs to change, and the rules
 * module will still validate everything the GM proposes.
 *
 * Do not call the Claude API directly from the browser: any key bundled into
 * frontend code is visible to everyone who opens the site.
 */
import type { GameMaster } from '../types';
import { ScriptedGameMaster } from './scriptedGameMaster';

export function createGameMaster(): GameMaster {
  // A short pause makes the "Game Master considers…" state visible.
  return new ScriptedGameMaster({ latencyMs: 500 });
}
