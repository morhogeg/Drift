/**
 * haptics — thin, safe wrapper over @capacitor/haptics.
 *
 * Every call is a no-op on web (and silently swallows errors) so callers can
 * fire haptics anywhere without guarding for platform. On iOS this gives the
 * app physical weight: a tap that *feels* like something happened.
 *
 * Usage:
 *   import { haptics } from '@/lib/haptics'
 *   haptics.impact('medium')   // drift opens, message sends
 *   haptics.selection()        // light tick — chip tap, first token lands
 *   haptics.success()          // push-to-main lands, save confirms
 *
 * Design intent (who fires what) lives in the drift-feel layer; this file is
 * only the mechanism.
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Capacitor } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

type ImpactWeight = 'light' | 'medium' | 'heavy'

const IMPACT_STYLE: Record<ImpactWeight, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
}

/** Fire-and-forget; never throws, never blocks the UI thread meaningfully. */
function safe(run: () => Promise<unknown>): void {
  if (!isNative) return
  run().catch(() => {
    /* haptics are non-essential — swallow (e.g. permission, simulator) */
  })
}

export const haptics = {
  /** A physical "thunk." Weight communicates significance of the action. */
  impact(weight: ImpactWeight = 'medium'): void {
    safe(() => Haptics.impact({ style: IMPACT_STYLE[weight] }))
  },

  /** A light tick for discrete selection changes (chips, nodes, toggles). */
  selection(): void {
    safe(() => Haptics.selectionStart().then(() => Haptics.selectionEnd()))
  },

  /** Positive resolution — something committed (push-to-main, saved). */
  success(): void {
    safe(() => Haptics.notification({ type: NotificationType.Success }))
  },

  /** Gentle warning — undo available, destructive confirm. */
  warning(): void {
    safe(() => Haptics.notification({ type: NotificationType.Warning }))
  },
}

export type { ImpactWeight }
