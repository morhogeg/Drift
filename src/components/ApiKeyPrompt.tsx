/**
 * ApiKeyPrompt — a friendly, just-in-time key request.
 *
 * Shown the moment a keyless user actually tries to ask their own question (not
 * as an upfront wall). Keeps the funnel "value first, key at point of need":
 * the sample exploration is explorable without this, and we only ask once the
 * user reaches for something that genuinely needs a model call.
 */
import { useState } from 'react'
import { X, ArrowUpRight, KeyRound } from 'lucide-react'

interface ApiKeyPromptProps {
  open: boolean
  onClose: () => void
  /** Persist the validated key and continue the user's pending action. */
  onSave: (key: string) => void
}

// A Gemini key looks like "AIza…" — same shape the onboarding step validates.
const GEMINI_KEY_RE = /^AIza[\w-]{10,}$/

export function ApiKeyPrompt({ open, onClose, onSave }: ApiKeyPromptProps) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  if (!open) return null

  const submit = () => {
    const trimmed = key.trim()
    if (!trimmed) {
      setError('Paste your free key to continue.')
      return
    }
    if (!GEMINI_KEY_RE.test(trimmed)) {
      setError("That doesn't look like a Gemini key (it should start with 'AIza').")
      return
    }
    setError('')
    onSave(trimmed)
    setKey('')
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add your free Gemini key"
        className="relative w-full max-w-[420px] rounded-2xl border border-accent-violet/25 bg-dark-elevated/95 p-6 shadow-2xl shadow-black/40 animate-fade-up"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/8 transition-colors"
          title="Maybe later"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-accent-violet/20 bg-gradient-to-br from-accent-pink/15 to-accent-violet/25 text-accent-violet">
          <KeyRound className="h-5 w-5" />
        </span>

        <h2 className="mt-4 text-[17px] font-semibold text-text-primary">Add your free Gemini key</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
          Drift runs on Google Gemini. Grab a free key — it takes about 30 seconds and stays on this
          device. Then your question sends right away.
        </p>

        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-violet hover:underline"
        >
          Get a free key from Google AI Studio
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>

        <input
          type="password"
          value={key}
          autoFocus
          onChange={(e) => { setKey(e.target.value); if (error) setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="AIza…"
          className="mt-4 w-full rounded-xl border border-dark-border/70 bg-dark-bg/70 px-4 py-2.5 text-[13.5px] text-text-primary placeholder:text-text-muted focus:border-accent-violet/50 focus:outline-none focus:shadow-[0_0_18px_rgba(168,85,247,0.15)]"
        />
        {error && <p className="mt-2 text-[12px] text-rose-400">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            Maybe later
          </button>
          <button
            onClick={submit}
            className="rounded-xl bg-gradient-to-br from-accent-pink to-accent-violet px-5 py-2 text-[13px] font-semibold text-white shadow-lg shadow-accent-violet/20 transition-transform active:scale-95"
          >
            Save & continue
          </button>
        </div>
      </div>
    </div>
  )
}
