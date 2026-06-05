/**
 * Onboarding — the first-run "this is what makes Drift special" moment.
 *
 * Shown ONCE per device (localStorage flag `drift_onboarded`). Mounted from App
 * only after the user is logged in. Three tight beats teach the magic, plus a
 * key-aware step that asks for a Gemini API key when none is configured (since
 * the Demo AI fallback was removed, a usable key is required to chat).
 *
 * Premium, not a generic modal tour: glassmorphic cards, the pink→violet brand
 * gradient, smooth motion that respects `prefers-reduced-motion`. No fake data
 * is ever seeded — the walkthrough is purely illustrative.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Sparkles, MousePointerClick, GitBranch, Waypoints, ArrowRight, ExternalLink, Check, KeyRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AISettings } from './Settings'
import { haptics } from '../lib/haptics'
import { ONBOARDED_FLAG } from '../lib/onboardingFlag'

export { ONBOARDED_FLAG }

interface OnboardingProps {
  settings: AISettings
  /** Persist a pasted Gemini key into settings (App wires this to settingsStorage). */
  onSaveGeminiKey: (key: string) => void
  /** Called when the user finishes or skips — App sets the localStorage flag + unmounts. */
  onDone: () => void
}

/** True when the app already has a usable Gemini key from any source. */
export function hasUsableGeminiKey(settings: AISettings): boolean {
  const env = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  if (env) return true
  if ((settings.geminiApiKey || '').trim()) return true
  return (settings.modelPresets || []).some(
    (p) => p.provider === 'gemini' && p.enabled && (p.apiKey || '').trim().length > 0,
  )
}

interface Beat {
  Icon: LucideIcon
  eyebrow: string
  title: string
  body: string
  art: 'ask' | 'select' | 'map'
}

const BEATS: Beat[] = [
  {
    Icon: MousePointerClick,
    eyebrow: 'Start anywhere',
    title: 'Ask anything',
    body: 'Begin a conversation like you would with any assistant — Drift answers fast and thinks deeply.',
    art: 'ask',
  },
  {
    Icon: GitBranch,
    eyebrow: 'The signature move',
    title: 'Select text to branch',
    body: 'Highlight any phrase in a reply to drift into a focused side-thread — explore one idea without losing your place.',
    art: 'select',
  },
  {
    Icon: Waypoints,
    eyebrow: 'See how it connects',
    title: 'Build a constellation',
    body: 'Every drift becomes a glowing node on your Drift Map. Synthesize them back together when you’re ready.',
    art: 'map',
  },
]

// ── Illustrative artwork (no live data) ──────────────────────────────────────

function BeatArt({ kind }: { kind: Beat['art'] }) {
  if (kind === 'ask') {
    return (
      <div className="flex flex-col gap-2 w-full max-w-[260px]">
        <div className="self-end px-3.5 py-2 rounded-2xl rounded-br-md bg-gradient-to-br from-accent-pink to-accent-violet text-white text-[13px] shadow-glow-sm">
          How do tides actually work?
        </div>
        <div className="self-start px-3.5 py-2 rounded-2xl rounded-bl-md bg-dark-elevated border border-dark-border/60 text-text-secondary text-[13px]">
          Tides are the rise and fall of sea levels caused mainly by the <span className="text-accent-violet">Moon’s gravity</span>…
        </div>
      </div>
    )
  }
  if (kind === 'select') {
    return (
      <div className="w-full max-w-[260px]">
        <div className="px-3.5 py-2 rounded-2xl bg-dark-elevated border border-dark-border/60 text-text-secondary text-[13px] leading-relaxed">
          …caused mainly by the{' '}
          <span className="relative rounded px-0.5 bg-accent-violet/25 text-text-primary">
            Moon’s gravity
          </span>{' '}
          pulling on Earth’s oceans.
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-accent-pink to-accent-violet text-white text-[12px] font-semibold shadow-glow-sm">
          <GitBranch className="w-3.5 h-3.5" />
          Drift
        </div>
      </div>
    )
  }
  // map
  return (
    <div className="relative w-full max-w-[260px] h-[120px]">
      {[
        { x: '18%', y: '30%', s: 1 },
        { x: '62%', y: '18%', s: 0.8 },
        { x: '78%', y: '64%', s: 0.9 },
        { x: '38%', y: '72%', s: 0.7 },
      ].map((n, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-accent-violet shadow-glow-sm"
          style={{
            left: n.x,
            top: n.y,
            width: 12 * n.s,
            height: 12 * n.s,
            boxShadow: '0 0 18px 2px rgba(168,85,247,0.5)',
          }}
        />
      ))}
      <svg className="absolute inset-0 w-full h-full" aria-hidden>
        <line x1="22%" y1="34%" x2="64%" y2="22%" stroke="rgba(168,85,247,0.35)" strokeWidth="1.5" />
        <line x1="22%" y1="34%" x2="40%" y2="74%" stroke="rgba(168,85,247,0.25)" strokeWidth="1.5" />
        <line x1="64%" y1="22%" x2="80%" y2="66%" stroke="rgba(168,85,247,0.25)" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

export default function Onboarding({ settings, onSaveGeminiKey, onDone }: OnboardingProps) {
  const reduce = useReducedMotion()
  const needsKey = useMemo(() => !hasUsableGeminiKey(settings), [settings])

  // Step model: 0..2 are the teaching beats; an optional key step follows when needed.
  const totalBeats = BEATS.length
  const [step, setStep] = useState(0)
  const onKeyStep = needsKey && step === totalBeats

  const [keyValue, setKeyValue] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)

  const lastBeat = step === totalBeats - 1
  const isFinalStep = needsKey ? onKeyStep : lastBeat

  const finish = () => {
    haptics.success()
    onDone()
  }

  const handleNext = () => {
    haptics.selection()
    if (onKeyStep) return // the key step has its own CTA
    if (lastBeat) {
      if (needsKey) {
        setStep(totalBeats) // advance into the key step
        return
      }
      finish()
      return
    }
    setStep((s) => s + 1)
  }

  const handleSaveKey = () => {
    const trimmed = keyValue.trim()
    if (!trimmed) {
      setKeyError('Paste your key to continue, or skip for now.')
      return
    }
    // Light sanity check — Google AI Studio keys start with "AIza".
    if (!/^AIza[\w-]{10,}$/.test(trimmed)) {
      setKeyError('That doesn’t look like a Gemini key (it should start with “AIza”).')
      return
    }
    onSaveGeminiKey(trimmed)
    finish()
  }

  const cardMotion = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12, filter: 'blur(6px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: { opacity: 0, y: -10, filter: 'blur(4px)' },
        transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
      }

  const stepKey = onKeyStep ? 'key' : `beat-${step}`
  const stepCount = needsKey ? totalBeats + 1 : totalBeats
  const dotIndex = onKeyStep ? totalBeats : step

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Drift"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Backdrop — deep, luminous, with the brand glow bleeding in */}
      <div className="absolute inset-0 bg-dark-bg/90 backdrop-blur-xl" />
      <div
        className="pointer-events-none absolute -top-1/4 left-1/2 -translate-x-1/2 w-[120vw] h-[60vh] opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(ellipse at center, rgba(168,85,247,0.35), rgba(255,0,122,0.12) 45%, transparent 70%)' }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={stepKey}
          {...cardMotion}
          className="relative w-full max-w-md rounded-3xl border border-dark-border/60 bg-dark-surface/80 backdrop-blur-2xl
                     shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)] overflow-hidden"
        >
          {/* Top hairline glow */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-violet/60 to-transparent" />

          <div className="px-7 pt-8 pb-6">
            {/* Brand mark */}
            <div className="flex items-center gap-2 mb-6">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-accent-pink to-accent-violet shadow-glow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </span>
              <span className="text-[13px] font-semibold tracking-tight text-text-primary">Drift</span>
            </div>

            {onKeyStep ? (
              // ── Key step ──────────────────────────────────────────────────
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-accent-violet/90 mb-2">
                  <KeyRound className="w-3.5 h-3.5" /> One quick setup
                </span>
                <h2 className="text-[22px] font-semibold tracking-tight text-text-primary leading-tight">
                  Connect Gemini to start
                </h2>
                <p className="mt-2 text-[14px] text-text-secondary leading-relaxed">
                  Drift runs on Google Gemini. Paste a free API key to begin — it stays on this device.
                </p>

                <div className="mt-5">
                  <input
                    type="password"
                    value={keyValue}
                    autoFocus
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="AIza…"
                    onChange={(e) => { setKeyValue(e.target.value); setKeyError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey() }}
                    className="w-full px-4 py-3 rounded-xl bg-dark-bg/80 border border-dark-border/60 text-text-primary
                               text-[14px] placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet/50
                               focus:border-accent-violet/50 transition-shadow"
                  />
                  {keyError && <p className="mt-2 text-[12px] text-accent-pink">{keyError}</p>}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-accent-violet hover:text-accent-violet-300 transition-colors"
                  >
                    Get a free key at Google AI Studio
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : (() => {
              // ── Teaching beat ─────────────────────────────────────────────
              // Clamp defensively so a transient out-of-range step can never crash.
              const beat = BEATS[Math.min(step, totalBeats - 1)]
              const BeatIcon = beat.Icon
              return (
                <div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-accent-violet/90 mb-2">
                    <BeatIcon className="w-3.5 h-3.5" /> {beat.eyebrow}
                  </span>
                  <h2 className="text-[22px] font-semibold tracking-tight text-text-primary leading-tight">
                    {beat.title}
                  </h2>
                  <p className="mt-2 text-[14px] text-text-secondary leading-relaxed">
                    {beat.body}
                  </p>

                  {/* Illustrative art */}
                  <div className="mt-6 flex items-center justify-center min-h-[128px] rounded-2xl bg-dark-bg/50 border border-dark-border/40 p-5">
                    <BeatArt kind={beat.art} />
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Footer: progress dots + actions */}
          <div className="flex items-center justify-between px-7 pb-7 pt-1">
            <div className="flex items-center gap-1.5" aria-hidden>
              {Array.from({ length: stepCount }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === dotIndex ? 'w-5 bg-accent-violet' : 'w-1.5 bg-dark-border'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={finish}
                className="text-[13px] text-text-muted hover:text-text-secondary transition-colors"
              >
                {onKeyStep ? 'Skip for now' : 'Skip'}
              </button>
              <motion.button
                type="button"
                whileTap={reduce ? undefined : { scale: 0.96 }}
                onClick={onKeyStep ? handleSaveKey : handleNext}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[13.5px] font-semibold text-white
                           bg-gradient-to-r from-accent-pink to-accent-violet shadow-glow-sm
                           hover:opacity-95 transition-opacity"
              >
                {onKeyStep ? (
                  <>Save &amp; start <Check className="w-4 h-4" /></>
                ) : isFinalStep ? (
                  <>Start exploring <ArrowRight className="w-4 h-4" /></>
                ) : (
                  <>Next <ArrowRight className="w-4 h-4" /></>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
