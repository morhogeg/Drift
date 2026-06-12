/**
 * auth — platform-aware sign-in for the optional cloud account.
 *
 * v1 ships Apple only, but the shape is provider-agnostic so email/Google can
 * drop in later: add a `signInWithX()` that builds its own credential and
 * everything downstream (onAuthChange, cloudSync, the UI) keeps working off
 * the normalized `CloudUser`.
 *
 * Platforms:
 *  - iOS (Capacitor native): @capacitor-firebase/authentication shows the
 *    native Apple sheet, then we hand the resulting credential to the Firebase
 *    JS SDK so web-layer auth state (and Firestore rules) see the same user.
 *  - Web: standard Firebase popup flow.
 *
 * Every export is inert when `isCloudEnabled()` is false.
 */

import { isCloudEnabled } from '@/lib/cloudConfig'
import { getFirebase } from './firebase'

export interface CloudUser {
  uid: string
  displayName: string | null
  email: string | null
}

export type AuthChangeCallback = (user: CloudUser | null) => void

function toCloudUser(u: { uid: string; displayName: string | null; email: string | null } | null): CloudUser | null {
  if (!u) return null
  return { uid: u.uid, displayName: u.displayName, email: u.email }
}

async function isNativePlatform(): Promise<boolean> {
  const { Capacitor } = await import('@capacitor/core')
  return Capacitor.isNativePlatform()
}

/**
 * Sign in with Apple. Resolves with the signed-in user.
 * Future providers follow the same shape (signInWithGoogle, etc.).
 */
export async function signInWithApple(): Promise<CloudUser> {
  if (!isCloudEnabled()) throw new Error('[cloud] sign-in requested while cloud is disabled')
  const { auth } = await getFirebase()
  const { OAuthProvider, signInWithCredential, signInWithPopup } = await import('firebase/auth')

  if (await isNativePlatform()) {
    // Native Apple sheet via the Capacitor plugin. skipNativeAuth: per the
    // plugin docs, Apple on iOS must authenticate on the web layer with the
    // returned credential (the native Firebase SDK can't be used here).
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
    const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true })
    const idToken = result.credential?.idToken
    if (!idToken) throw new Error('Apple sign-in did not return a credential.')
    const provider = new OAuthProvider('apple.com')
    const credential = provider.credential({ idToken, rawNonce: result.credential?.nonce })
    const cred = await signInWithCredential(auth, credential)
    return toCloudUser(cred.user)!
  }

  // Web: popup flow.
  const provider = new OAuthProvider('apple.com')
  provider.addScope('email')
  provider.addScope('name')
  const cred = await signInWithPopup(auth, provider)
  return toCloudUser(cred.user)!
}

/** Sign out everywhere (JS SDK + native layer when applicable). */
export async function signOut(): Promise<void> {
  if (!isCloudEnabled()) return
  const { auth } = await getFirebase()
  if (await isNativePlatform()) {
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
      await FirebaseAuthentication.signOut()
    } catch {
      // Native layer sign-out is best-effort; the JS layer is authoritative.
    }
  }
  await auth.signOut()
}

/**
 * Subscribe to auth state changes. Returns an unsubscribe function.
 * When cloud is disabled this registers nothing and returns a no-op.
 */
export function onAuthChange(cb: AuthChangeCallback): () => void {
  if (!isCloudEnabled()) return () => {}
  let unsub: (() => void) | null = null
  let cancelled = false
  getFirebase()
    .then(({ auth }) => {
      if (cancelled) return
      unsub = auth.onAuthStateChanged((u) => cb(toCloudUser(u)))
    })
    .catch((err) => console.error('[cloud] onAuthChange init failed:', err))
  return () => {
    cancelled = true
    unsub?.()
  }
}

/** Current signed-in user, or null (also null whenever cloud is disabled). */
export async function getCurrentUser(): Promise<CloudUser | null> {
  if (!isCloudEnabled()) return null
  const { auth } = await getFirebase()
  return toCloudUser(auth.currentUser)
}
