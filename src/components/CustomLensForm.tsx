/**
 * CustomLensForm — the name + color + system-prompt fields for a custom lens.
 * Shared by the Settings manager (CustomLensManager) and the inline "New lens"
 * sheet (CustomLensSheet) so the two creation paths stay identical.
 */
import { useState } from 'react'
import type { CustomLens } from '../lib/customLenses'

// A palette distinct from the built-in lens hues (amber / blue / cyan / rose /
// violet / emerald) so a custom lens stays visually its own thing.
const LENS_PALETTE = ['#14b8a6', '#0ea5e9', '#6366f1', '#d946ef', '#ec4899', '#f97316', '#84cc16', '#eab308']

interface LensFormValues { name: string; color: string; systemPrompt: string }

export default function CustomLensForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: CustomLens | null
  submitLabel: string
  onSubmit: (values: LensFormValues) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? LENS_PALETTE[0])
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '')

  const canSave = name.trim().length > 0 && systemPrompt.trim().length > 0
  const submit = () => {
    if (canSave) onSubmit({ name: name.trim(), color, systemPrompt: systemPrompt.trim() })
  }

  return (
    <div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Lens name — e.g. Steelman, ELI5, Devil's advocate"
        maxLength={40}
        autoFocus
        className="w-full px-3 py-2.5 rounded-xl bg-dark-elevated border border-dark-border text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-violet/50 transition-colors"
      />

      <div className="flex items-center gap-2 mt-3 mb-1 flex-wrap">
        <span className="text-[11px] text-text-muted/80 mr-1">Color</span>
        {LENS_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-white/70' : 'hover:scale-105 ring-1 ring-white/10'}`}
            style={{ backgroundColor: c }}
            aria-label={`Use color ${c}`}
          />
        ))}
      </div>

      <textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder="How should the AI look at the highlighted term through this lens? Write it as an instruction — e.g. 'Argue the strongest possible case FOR this idea, then the strongest case against, fairly and specifically.'"
        rows={5}
        className="w-full mt-2 px-3 py-2.5 rounded-xl bg-dark-elevated border border-dark-border text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-violet/50 transition-colors resize-y leading-relaxed"
      />
      <p className="text-[11px] text-text-muted/60 mt-1.5 px-0.5">Tip: be specific about the angle and the shape of the answer. The term and its surrounding conversation are supplied automatically.</p>

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-accent-violet hover:bg-accent-violet/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
