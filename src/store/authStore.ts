/**
 * authStore — cloud account state (optional feature, see src/lib/cloudConfig).
 *
 * Holds the signed-in user and a coarse auth status for the Account UI.
 * Nothing here touches Firebase at import time: the store starts 'signed-out'
 * and is only ever updated by cloud bootstrap/UI code that is itself gated on
 * `isCloudEnabled()`. When cloud is disabled this store simply sits idle.
 */

import { create } from 'zustand'
import type { CloudUser } from '@/services/auth'

export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in'

interface AuthStore {
  // ── State ──────────────────────────────────────────────────────────────────
  user: CloudUser | null
  status: AuthStatus
  /** Human-readable error from the last failed sign-in attempt (transient). */
  authError: string | null

  // ── Actions ────────────────────────────────────────────────────────────────
  setUser: (user: CloudUser | null) => void
  setStatus: (status: AuthStatus) => void
  setAuthError: (error: string | null) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  status: 'signed-out',
  authError: null,

  setUser: (user) =>
    set({ user, status: user ? 'signed-in' : 'signed-out' }),
  setStatus: (status) => set({ status }),
  setAuthError: (authError) => set({ authError }),
}))
