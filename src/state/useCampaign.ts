/**
 * React glue between the UI and the game engine. All rules live in `src/game`;
 * this hook only holds the current state, serialises submissions so two
 * players acting at once are resolved one after another, and saves the result.
 *
 * Concurrency note (MVP): the last save wins. When Firestore replaces the local
 * repository, writes should become transactions or go through a server-side
 * function so two players cannot overwrite each other's results.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CampaignState, GameMaster, PlayerId } from '../types';
import { processAction } from '../game/engine';
import type { CampaignRepository } from '../firebase/repository';

export interface UseCampaignOptions {
  gm: GameMaster;
  repo: CampaignRepository;
  createInitial: () => CampaignState;
}

export interface CampaignController {
  /** null until the first load finishes. */
  state: CampaignState | null;
  /** Number of submitted actions still being resolved. */
  pending: number;
  submit: (playerId: PlayerId, text: string) => Promise<void>;
  reset: () => Promise<void>;
}

export function useCampaign({ gm, repo, createInitial }: UseCampaignOptions): CampaignController {
  const [state, setState] = useState<CampaignState | null>(null);
  const [pending, setPending] = useState(0);
  const stateRef = useRef<CampaignState | null>(null);
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const createInitialRef = useRef(createInitial);
  createInitialRef.current = createInitial;

  const commit = useCallback((next: CampaignState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Load once, then follow changes made by other tabs/computers.
  useEffect(() => {
    let cancelled = false;
    void repo.load().then((saved) => {
      if (cancelled) return;
      commit(saved ?? createInitialRef.current());
    });
    const unsubscribe = repo.subscribe((remote) => {
      // Never clobber an action that is mid-resolution.
      if (!cancelled && pendingRef.current === 0) commit(remote);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [repo, commit]);

  const submit = useCallback(
    (playerId: PlayerId, text: string) => {
      pendingRef.current += 1;
      setPending(pendingRef.current);
      const run = async () => {
        try {
          const current = stateRef.current;
          if (!current) return;
          const next = await processAction(current, playerId, text, { gm, onProgress: commit });
          commit(next);
          await repo.save(next);
        } finally {
          pendingRef.current -= 1;
          setPending(pendingRef.current);
        }
      };
      queueRef.current = queueRef.current.then(run, run);
      return queueRef.current;
    },
    [gm, repo, commit],
  );

  const reset = useCallback(async () => {
    await queueRef.current;
    const fresh = createInitialRef.current();
    commit(fresh);
    await repo.save(fresh);
  }, [repo, commit]);

  return { state, pending, submit, reset };
}
