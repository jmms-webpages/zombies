/**
 * Firebase configuration, read from Vite env vars.
 *
 * The MVP does not connect to Firebase. This module only reports whether a
 * config is present, so the rest of the app can decide between the local
 * repository and (later) a Firestore one. Nothing here talks to the network.
 *
 * These values identify a Firebase project and are public by design; access is
 * enforced by Auth + Firestore security rules. Never put a Claude/Anthropic API
 * key in any VITE_* variable, because it would be shipped to every browser.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

type Env = Record<string, string | undefined>;

export function readFirebaseConfig(env: Env = import.meta.env as Env): FirebaseConfig | null {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const complete = Object.values(config).every((v) => typeof v === 'string' && v.trim() !== '');
  return complete ? (config as FirebaseConfig) : null;
}

export function isFirebaseConfigured(env?: Env): boolean {
  return readFirebaseConfig(env) !== null;
}
