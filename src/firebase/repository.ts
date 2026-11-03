/**
 * Persistence boundary. The UI and game logic only ever see `CampaignRepository`.
 *
 * Today: `LocalStorageRepository` (this browser only; other tabs on the same
 * computer stay in sync through the `storage` event, which is handy for trying
 * three "players" side by side).
 *
 * Later: a `FirestoreRepository` implements the same interface, with
 * `subscribe` backed by `onSnapshot`, so three separate computers share one
 * campaign. It is intentionally not written yet, since that needs a Firebase
 * project and security rules that you have not approved.
 */
import type { CampaignState } from '../types';

export interface CampaignRepository {
  /** The saved campaign, or null if there is none (or it is unreadable). */
  load(): Promise<CampaignState | null>;
  save(state: CampaignState): Promise<void>;
  clear(): Promise<void>;
  /** Be told when ANOTHER browser/tab changes the campaign. Returns an unsubscribe. */
  subscribe(listener: (state: CampaignState) => void): () => void;
}

/** The slice of the Web Storage API we use, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Cheap structural check so a stale or corrupt save cannot crash the app. */
export function isCampaignState(value: unknown): value is CampaignState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === 1 &&
    typeof v.id === 'string' &&
    typeof v.clock === 'number' &&
    typeof v.locationId === 'string' &&
    typeof v.locations === 'object' && v.locations !== null &&
    typeof v.characters === 'object' && v.characters !== null &&
    Array.isArray(v.partyOrder) &&
    Array.isArray(v.events) &&
    typeof (v.locations as Record<string, unknown>)[v.locationId] === 'object'
  );
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // storage blocked (private mode, etc.)
  }
}

export class LocalStorageRepository implements CampaignRepository {
  constructor(
    private readonly key = 'zombie-school-rpg.campaign.v1',
    private readonly storage: StorageLike | null = defaultStorage(),
  ) {}

  private parse(raw: string | null): CampaignState | null {
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isCampaignState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async load(): Promise<CampaignState | null> {
    try {
      return this.parse(this.storage?.getItem(this.key) ?? null);
    } catch {
      return null;
    }
  }

  async save(state: CampaignState): Promise<void> {
    try {
      this.storage?.setItem(this.key, JSON.stringify(state));
    } catch {
      // Out of quota or blocked: the game keeps working in memory.
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // ignore
    }
  }

  subscribe(listener: (state: CampaignState) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const onStorage = (e: StorageEvent) => {
      if (e.key !== this.key) return;
      const next = this.parse(e.newValue);
      if (next) listener(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
}

/** Non-persistent repository, for tests. */
export class MemoryRepository implements CampaignRepository {
  private state: CampaignState | null = null;
  private listeners = new Set<(s: CampaignState) => void>();

  async load() {
    return this.state ? structuredClone(this.state) : null;
  }
  async save(state: CampaignState) {
    this.state = structuredClone(state);
  }
  async clear() {
    this.state = null;
  }
  subscribe(listener: (s: CampaignState) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  /** Test helper: pretend another computer saved something. */
  pushRemote(state: CampaignState) {
    this.state = structuredClone(state);
    this.listeners.forEach((l) => l(structuredClone(state)));
  }
}
