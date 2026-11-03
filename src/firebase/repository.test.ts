import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, MemoryRepository, isCampaignState, type StorageLike } from './repository';
import { isFirebaseConfigured, readFirebaseConfig } from './config';
import { freshState } from '../test/helpers';

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('isCampaignState', () => {
  it('accepts a real campaign and rejects look-alikes', () => {
    const s = freshState();
    expect(isCampaignState(s)).toBe(true);
    expect(isCampaignState(null)).toBe(false);
    expect(isCampaignState({})).toBe(false);
    expect(isCampaignState({ ...s, schemaVersion: 2 })).toBe(false);
    expect(isCampaignState({ ...s, locationId: 'nowhere' })).toBe(false);
    expect(isCampaignState({ ...s, events: 'lots' })).toBe(false);
  });
});

describe('LocalStorageRepository', () => {
  it('saves and loads a campaign', async () => {
    const repo = new LocalStorageRepository('k', fakeStorage());
    expect(await repo.load()).toBeNull();
    const s = freshState();
    await repo.save(s);
    expect(await repo.load()).toEqual(s);
    await repo.clear();
    expect(await repo.load()).toBeNull();
  });

  it('treats corrupt or outdated saves as "no save" instead of crashing', async () => {
    const storage = fakeStorage();
    const repo = new LocalStorageRepository('k', storage);
    storage.data.set('k', '{not json');
    expect(await repo.load()).toBeNull();
    storage.data.set('k', JSON.stringify({ schemaVersion: 0 }));
    expect(await repo.load()).toBeNull();
  });

  it('keeps working when storage is missing or throws', async () => {
    const none = new LocalStorageRepository('k', null);
    await none.save(freshState());
    expect(await none.load()).toBeNull();

    const angry: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const repo = new LocalStorageRepository('k', angry);
    await repo.save(freshState());
    expect(await repo.load()).toBeNull();
    await repo.clear();
  });

  it('subscribe returns an unsubscribe function even without a window', () => {
    const off = new LocalStorageRepository('k', fakeStorage()).subscribe(() => {});
    expect(typeof off).toBe('function');
    off();
  });
});

describe('MemoryRepository', () => {
  it('stores copies, so later edits to the original do not leak in', async () => {
    const repo = new MemoryRepository();
    const s = freshState();
    await repo.save(s);
    s.noise = 9;
    expect((await repo.load())?.noise).toBe(1);
  });

  it('tells listeners when "another computer" saves, until they unsubscribe', () => {
    const repo = new MemoryRepository();
    const seen: number[] = [];
    const off = repo.subscribe((s) => seen.push(s.noise));
    repo.pushRemote({ ...freshState(), noise: 4 });
    off();
    repo.pushRemote({ ...freshState(), noise: 6 });
    expect(seen).toEqual([4]);
  });
});

describe('firebase config', () => {
  it('is "not configured" until every value is present, so the app stays offline', () => {
    expect(isFirebaseConfigured({})).toBe(false);
    expect(isFirebaseConfigured({ VITE_FIREBASE_API_KEY: 'a', VITE_FIREBASE_PROJECT_ID: 'p' })).toBe(false);
    const full = {
      VITE_FIREBASE_API_KEY: 'a',
      VITE_FIREBASE_AUTH_DOMAIN: 'd',
      VITE_FIREBASE_PROJECT_ID: 'p',
      VITE_FIREBASE_APP_ID: 'i',
    };
    expect(isFirebaseConfigured(full)).toBe(true);
    expect(readFirebaseConfig(full)).toEqual({ apiKey: 'a', authDomain: 'd', projectId: 'p', appId: 'i' });
    expect(isFirebaseConfigured({ ...full, VITE_FIREBASE_APP_ID: '  ' })).toBe(false);
  });
});
