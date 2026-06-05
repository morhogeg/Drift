/**
 * The localStorage key marking that first-run onboarding has been completed.
 * Lives in its own tiny module so `App.tsx` can read the flag (in a useState
 * initializer) without eagerly importing the whole Onboarding component —
 * letting that component be code-split / lazy-loaded.
 */
export const ONBOARDED_FLAG = 'drift_onboarded'
