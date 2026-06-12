/**
 * CustomLensManager — the Settings UI for user-defined lenses.
 *
 * A lens is a name + accent color + system prompt (persisted in customLensStore).
 * Once saved, it appears alongside the built-in lenses in the selection tooltip and
 * the in-drift "View as" bar, so the user can re-view any highlighted term through
 * their own framing. This component only handles create / edit / delete; resolving a
 * lens to its prompt lives in customLenses.ts.
 */
import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { customLensStore, type CustomLens } from '../lib/customLenses'

// A palette distinct from the built-in lens hues (amber / blue / cyan / rose /
// violet / emerald) so a custom lens stays visually its own thing.
const PALETTE = ['#14b8a6', '#0ea5e9', '#6366f1', '#d946ef', '#ec4899', '#f97316', '#84cc16', '#eab308']

interface Draft {
  id?: string
  name: string
  color: string
  systemPrompt: string
}

const BLANK: Draft = { name: '', color: PALETTE[0], systemPrompt: '' }

export default function CustomLensManager() {
  const [lenses, setLenses] = useState<CustomLens[]>(() => customLensStore.getAll())
  const [draft, setDraft] = useState<Draft | null>(null)

  const refresh = () => setLenses(customLensStore.getAll())

  const save = () => {
    if (!draft) return
    const name = draft.name.trim()
    const systemPrompt = draft.systemPrompt.trim()
    if (!name || !systemPrompt) return
    customLensStore.save({ id: draft.id, name, color: draft.color, systemPrompt })
    refresh()
    setDraft(null)
  }

  const remove = (id: string) => {
    customLensStore.delete(id)
    refresh()
    if (draft?.id === id) setDraft(null)
  }

  const canSave = !!draft && draft.name.trim().length > 0 && draft.systemPrompt.trim().length > 0

  return (
    <div className="mx-4">
      {/* Existing lenses */}
      {lenses.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-b from-black/[0.02] to-transparent dark:from-white/[0.045] dark:to-white/[0.015] border border-dark-border divide-y divide-dark-border overflow-hidden">
          {lenses.map((lens) => (
            <div key={lens.id} className="flex items-center gap-3 px-4 min-h-[56px] py-2.5">
              <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ring-white/10" style={{ backgroundColor: lens.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-text-primary truncate leading-tight">{lens.name}</p>
                <p className="text-[11.5px] text-text-muted mt-0.5 truncate">{lens.systemPrompt}</p>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ id: lens.id, name: lens.name, color: lens.color, systemPrompt: lens.systemPrompt })}
                className="p-1.5 rounded-md text-text-muted/70 hover:text-text-primary transition-colors"
                title="Edit lens"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(lens.id)}
                className="p-1.5 rounded-md text-text-muted/70 hover:text-rose-400 transition-colors"
                title="Delete lens"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      {draft ? (
        <div className="mt-3 rounded-2xl border border-accent-violet/25 bg-accent-violet/[0.04] p-3.5">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Lens name — e.g. Steelman, ELI5, Devil's advocate"
            maxLength={40}
            className="w-full px-3 py-2.5 rounded-xl bg-dark-elevated border border-dark-border text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-violet/50 transition-colors"
          />

          <div className="flex items-center gap-2 mt-3 mb-1">
            <span className="text-[11px] text-text-muted/80 mr-1">Color</span>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft({ ...draft, color: c })}
                className={`w-6 h-6 rounded-full transition-transform ${draft.color === c ? 'scale-110 ring-2 ring-white/70' : 'hover:scale-105 ring-1 ring-white/10'}`}
                style={{ backgroundColor: c }}
                aria-label={`Use color ${c}`}
              />
            ))}
          </div>

          <textarea
            value={draft.systemPrompt}
            onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
            placeholder="How should the AI look at the highlighted term through this lens? Write it as an instruction — e.g. 'Argue the strongest possible case FOR this idea, then the strongest case against, fairly and specifically.'"
            rows={5}
            className="w-full mt-2 px-3 py-2.5 rounded-xl bg-dark-elevated border border-dark-border text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-violet/50 transition-colors resize-y leading-relaxed"
          />
          <p className="text-[11px] text-text-muted/60 mt-1.5 px-0.5">Tip: be specific about the angle and the shape of the answer. The term and its surrounding conversation are supplied automatically.</p>

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-accent-violet hover:bg-accent-violet/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {draft.id ? 'Save changes' : 'Create lens'}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="px-4 py-2.5 rounded-xl text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDraft({ ...BLANK })}
          className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-accent-violet-300 bg-accent-violet/[0.07] border border-accent-violet/25 hover:bg-accent-violet/[0.12] hover:border-accent-violet/40 active:scale-[0.99] transition-all"
        >
          <Plus className="w-4 h-4" />
          New lens
        </button>
      )}
    </div>
  )
}
