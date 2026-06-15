/**
 * CustomLensManager — the Settings UI for user-defined lenses.
 *
 * A lens is a name + accent color + system prompt (persisted in customLensStore).
 * Once saved, it appears alongside the built-in lenses in the selection tooltip and
 * the in-drift "View as" bar, so the user can re-view any highlighted term through
 * their own framing. This component handles create / edit / delete; the field UI
 * lives in CustomLensForm and prompt resolution in customLenses.ts.
 */
import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { customLensStore, type CustomLens } from '../lib/customLenses'
import { useUIStore } from '../store/uiStore'
import CustomLensForm from './CustomLensForm'

export default function CustomLensManager() {
  const bump = useUIStore((s) => s.bumpCustomLensesVersion)
  // Re-read whenever the shared version changes (e.g. a lens created from the
  // inline tooltip sheet) so this list stays in sync.
  const version = useUIStore((s) => s.customLensesVersion)
  const [lenses, setLenses] = useState<CustomLens[]>(() => customLensStore.getAll())
  // null = closed, '' = creating, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null)

  // Refresh the list from storage on every render where the version moved.
  const [seenVersion, setSeenVersion] = useState(version)
  if (version !== seenVersion) {
    setSeenVersion(version)
    setLenses(customLensStore.getAll())
  }

  const refresh = () => { setLenses(customLensStore.getAll()); bump() }

  const editingLens = editing ? lenses.find((l) => l.id === editing) ?? null : null

  const remove = (id: string) => {
    customLensStore.delete(id)
    refresh()
    if (editing === id) setEditing(null)
  }

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
                onClick={() => setEditing(lens.id)}
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
      {editing !== null ? (
        <div className="mt-3 rounded-2xl border border-accent-violet/25 bg-accent-violet/[0.04] p-3.5">
          <CustomLensForm
            initial={editingLens}
            submitLabel={editingLens ? 'Save changes' : 'Create lens'}
            onSubmit={({ name, color, systemPrompt }) => {
              customLensStore.save({ id: editingLens?.id, name, color, systemPrompt })
              refresh()
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing('')}
          className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-accent-violet-300 bg-accent-violet/[0.07] border border-accent-violet/25 hover:bg-accent-violet/[0.12] hover:border-accent-violet/40 active:scale-[0.99] transition-all"
        >
          <Plus className="w-4 h-4" />
          New lens
        </button>
      )}
    </div>
  )
}
