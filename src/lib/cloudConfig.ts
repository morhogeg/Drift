/**
 * cloudConfig — the single gate for the optional cloud account feature.
 *
 * Drift is local-first: cloud backup/restore only exists when the owner has
 * filled in every VITE_FIREBASE_* var (see .env.example). The repo ships with
 * them blank, so by default `isCloudEnabled()` is false and NOTHING cloud-
 * related runs: Firebase is never imported/initialized, no auth listeners are
 * registered, no Account UI is rendered, no network calls are made.
 *
 * Every cloud entry point MUST check `isCloudEnabled()` before doing anything.
 */

export interface FirebaseEnvConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

// Vite statically replaces import.meta.env.VITE_* at build time, so when the
// vars are blank this whole module is a handful of empty-string constants.
const env = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

/** True only when EVERY Firebase env var is present and non-blank. */
export function isCloudEnabled(): boolean {
  return Object.values(env).every((v) => typeof v === 'string' && v.trim().length > 0)
}

/**
 * Typed Firebase config. Throws if called while the feature is disabled —
 * callers must gate on `isCloudEnabled()` first.
 */
export function getFirebaseConfig(): FirebaseEnvConfig {
  if (!isCloudEnabled()) {
    throw new Error('[cloud] getFirebaseConfig() called while cloud is disabled')
  }
  return {
    apiKey: env.apiKey!,
    authDomain: env.authDomain!,
    projectId: env.projectId!,
    storageBucket: env.storageBucket!,
    messagingSenderId: env.messagingSenderId!,
    appId: env.appId!,
  }
}
