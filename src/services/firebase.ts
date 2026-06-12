/**
 * firebase — lazy, gated initialization of the Firebase JS SDK.
 *
 * The SDK is imported with dynamic `import()` so Vite splits it into its own
 * chunk: when cloud is disabled (blank env), that chunk is never even fetched.
 * Initialization happens at most once, on first use, and ONLY when
 * `isCloudEnabled()` is true.
 *
 * Nothing in this module runs at import time.
 */

import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import { getFirebaseConfig, isCloudEnabled } from '@/lib/cloudConfig'

interface FirebaseHandles {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let _handles: Promise<FirebaseHandles> | null = null

/**
 * Get the lazily-initialized Firebase app/auth/db. Rejects when cloud is
 * disabled — every caller must already be gated on `isCloudEnabled()`.
 */
export function getFirebase(): Promise<FirebaseHandles> {
  if (!isCloudEnabled()) {
    return Promise.reject(new Error('[cloud] Firebase requested while cloud is disabled'))
  }
  if (!_handles) {
    _handles = (async () => {
      const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ])
      const app = initializeApp(getFirebaseConfig())
      return { app, auth: getAuth(app), db: getFirestore(app) }
    })().catch((err) => {
      _handles = null // allow a retry after a transient failure
      throw err
    })
  }
  return _handles
}
