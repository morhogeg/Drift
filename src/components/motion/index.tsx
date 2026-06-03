/**
 * motion/ — shared motion primitives for the Apple-level feel.
 *
 * Thin wrappers over framer-motion so every animated surface in Drift moves
 * with the same physics and honors `prefers-reduced-motion` for free. Subagents
 * compose these instead of hand-rolling transitions per file — that keeps edits
 * to large files (App.tsx) small and the motion vocabulary consistent.
 *
 *   <Reveal>           one element arriving (fade + rise)
 *   <Stagger><Reveal/> a list whose children arrive in sequence
 *   <Bloom>            a space unfolding (scale + blur + glow) — drift open
 *   <Pressable>        a tappable surface with weight + optional haptic
 *
 * Shared easing mirrors the tailwind tokens (spring / out-expo).
 */

import { motion, AnimatePresence, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef, type ReactNode } from 'react'
import { haptics, type ImpactWeight } from '../../lib/haptics'

// Easing tuples mirror tailwind.config.js transitionTimingFunction tokens.
export const EASE_SPRING = [0.34, 1.46, 0.64, 1] as const
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

export { AnimatePresence }

// ── Reveal ──────────────────────────────────────────────────────────────────
// One element arriving: it rises and fades in. Use for messages, cards, rows.

interface RevealProps extends HTMLMotionProps<'div'> {
  /** Seconds to wait before animating (manual stagger when not inside Stagger). */
  delay?: number
  /** Travel distance in px (default 8). */
  y?: number
}

export const Reveal = forwardRef<HTMLDivElement, RevealProps>(function Reveal(
  { delay = 0, y = 8, children, ...rest },
  ref,
) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT_EXPO, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  )
})

// ── Stagger ─────────────────────────────────────────────────────────────────
// Wrap a list of <Reveal> (or any motion children) so they arrive in sequence.
// Children should use `variants={staggerChild}` or just be <Reveal> elements.

interface StaggerProps extends HTMLMotionProps<'div'> {
  /** Gap between each child's start, in seconds. */
  step?: number
}

export function Stagger({ step = 0.05, children, ...rest }: StaggerProps) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduce ? 0 : step } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Variant for direct children of <Stagger> that aren't <Reveal>. */
export const staggerChild = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
}

// ── Bloom ───────────────────────────────────────────────────────────────────
// A space unfolding — scale up from slightly small, blur clearing. This is the
// "I'm about to go somewhere" moment for opening a drift / branching.

interface BloomProps extends HTMLMotionProps<'div'> {
  /** When false, the element animates out (pair with AnimatePresence). */
  show?: boolean
}

export function Bloom({ show = true, children, ...rest }: BloomProps) {
  const reduce = useReducedMotion()
  if (reduce) {
    return show ? <div {...(rest as object)}>{children as ReactNode}</div> : null
  }
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
          transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
          {...rest}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Pressable ───────────────────────────────────────────────────────────────
// A tappable surface with physical weight: it gives under the finger and (on
// iOS) ticks. Drop-in for buttons/cards that should feel alive.

interface PressableProps extends HTMLMotionProps<'button'> {
  /** Haptic weight on press; pass null to disable. Default 'light'. */
  haptic?: ImpactWeight | null
}

export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { haptic = 'light', onPointerDown, children, ...rest },
  ref,
) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      ref={ref}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.12, ease: EASE_SPRING }}
      onPointerDown={(e) => {
        if (haptic) haptics.impact(haptic)
        onPointerDown?.(e)
      }}
      {...rest}
    >
      {children}
    </motion.button>
  )
})
