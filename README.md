# Zombie School RPG

A private, three-player, text-based zombie survival game set in a fictional American middle school.
Three adult survivors, scarce supplies, tense choices, cooperative storytelling.

**Current state: MVP foundation.** Everything runs locally in the browser with mock data and a
scripted Game Master. There is no backend, no Firebase connection and no API key anywhere.

## Quick start (GitHub Codespaces or any machine with Node 20+)

```bash
npm install          # first time only; creates package-lock.json (commit it)
npm run dev          # http://localhost:5173  (Codespaces forwards the port for you)
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run all unit/UI tests once (vitest) |
| `npm run test:watch` | Re-run tests as you edit |
| `npm run typecheck` | TypeScript check, no output files |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run preview` | Serve the production build on port 4173 |

### Trying it as three players

Each browser chooses who it plays from the **Playing as** menu (remembered per browser), or open
`/?player=marcus`. Until Firestore is wired up, the campaign is saved in this browser's
`localStorage`; tabs on the same computer stay in sync, so open three tabs, one per survivor, to
see how it will feel. **New campaign** resets it.

Things to type: `search the office`, `listen carefully`, `quietly go to the main hallway`,
`bandage Marcus`, `rest`, `sprint to the gym`, `smash the window` (loud!). The chips above the box
fill in suggestions.

## Rules in one screen

* **Check:** `d20 + skill modifier (+ best item bonus, −2 if exhausted)` against a DC.
  Difficulty DCs: Easy 8, Routine 11, Hard 14, Very hard 17, Extreme 20.
* **Natural 20** always succeeds critically; **natural 1** always fails critically.
* **Noise** (0–10) makes the dead notice you: DC +1 at 5+, +2 at 8+. Quiet actions lower it.
* **Health** at 0 means a survivor is down. **Stamina** at 0 means −2 on every roll.
* All the numbers live in `src/game/rules.ts`.

## Architecture

```
src/
  types/            Shared TypeScript types only. No runtime code.
  game/             THE RULES. Pure functions, no React, no Firebase, no network.
    dice.ts           d20 and friends; every roll takes an injectable RNG (tests use fixed dice)
    rules.ts          checks, effect resolution, applyEffect, GM-output validation
    engine.ts         processAction: the pipeline from player text to new state
    items.ts clock.ts labels.ts suggestions.ts
  gm/               Game Masters. scriptedGameMaster.ts today; index.ts picks which one is used
  data/             mockCampaign.ts: three survivors, seven locations, starting story
  firebase/         Persistence boundary: CampaignRepository, localStorage impl, Firebase config reader
  state/            useCampaign: the one React hook that holds state and runs the pipeline
  components/       Presentational React components (no game rules inside)
  test/helpers.ts   Fixed-dice and state helpers for tests
  App.tsx main.tsx  Layout and entry point
```

### The authority rule: the Game Master can never set stats

```
player text ─▶ GM.adjudicate   (UNTRUSTED: returns a suggestion such as
                                "scavenging check, hard, moderate risk, noisy")
            ─▶ sanitizeAdjudication   (unknown fields, players, places and skills are dropped;
                                       there is no field that can carry a number)
            ─▶ resolveAction          (rolls the dice and chooses every number itself)
            ─▶ applyEffect            (the ONLY code that changes health, items, location…)
            ─▶ GM.narrate             (text only)
```

* A `GameMaster` implements two methods, `adjudicate` and `narrate` (see `src/types`).
* The GM receives a **frozen deep copy** of the game, so editing it cannot touch real state.
* A GM that throws or returns nonsense degrades to "nothing happens"; the game continues.

### Swapping in the Claude-powered Game Master later

Write a class implementing `GameMaster` whose methods call a **server-side** endpoint (a Cloud
Function or Cloud Run service) that holds the Anthropic API key and returns JSON, then return it
from `createGameMaster()` in `src/gm/index.ts`. Nothing else changes, and the rules still
validate everything it proposes. Never put the key in frontend code or in any `VITE_*` variable:
those are shipped to every visitor's browser.

> Firebase Spark has no server-side compute for this. When you reach that step, we will need to
> choose a host for the proxy (a paid or free-tier service). That is a billing decision for you.

### Moving to Firebase (not done yet)

1. Create a Firebase project and copy the web config into `.env.local` (see `.env.example`).
2. Add a `FirestoreRepository` implementing `CampaignRepository` (`onSnapshot` for `subscribe`).
3. Add Firebase Auth and Firestore security rules limiting the campaign to your three accounts.
4. Move action resolution into a transaction or server function so two players acting at the same
   instant cannot overwrite each other (today: last save wins, acceptable for one browser).

## Notes

* UI colours are defined as Tailwind theme tokens in `src/index.css`.
* The interface respects `prefers-reduced-motion`.
* Story text, dice results and meters are exposed to screen readers via ARIA labels and live regions.
