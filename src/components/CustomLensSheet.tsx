/**
 * CustomLensSheet — a focused modal for creating (or editing) a custom lens
 * without leaving the reading flow. Opened from the selection tooltip or the
 * in-drift "View as" bar via uiStore.openCustomLensEditor(). Rendered once at the
 * app root. The Settings manager remains the full list/management surface; this is
 * the quick inline path.
 */
import { X } from 'lucide-react'
import { customLensStore } from '../lib/customLenses'
import { useUIStore } from '../store/uiStore'
import CustomLensForm from './CustomLensForm'

export default function CustomLensSheet() {
  const editorId = useUIStore((s) => s.customLensEditorId)
  const close = useUIStore((s) => s.closeCustomLensEditor)
  const bump = useUIStore((s) => s.bumpCustomLensesVersion)

  if (editorId === null) return null
  const initial = editorId ? customLensStore.get(editorId) ?? null : null

  return (
    <div
      className="fixed inset-0 z-[100001] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-up" />
      <div className="relative w-full max-w-md rounded-2xl bg-dark-surface border border-dark-border shadow-[0_24px_64px_rgba(0,0,0,0.6)] p-4 animate-fade-up">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-semibold text-text-primary tracking-tight">
            {initial ? 'Edit lens' : 'New lens'}
          </h2>
          <button
            type="button"
            onClick={close}
            className="p-1.5 -mr-1 rounded-md text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>
        <p className="text-[12.5px] text-text-muted/80 leading-snug mb-3">
          Define your own way to re-view any highlighted term. It’ll appear next to the built-in lenses everywhere.
        </p>
        <CustomLensForm
          initial={initial}
          submitLabel={initial ? 'Save changes' : 'Create lens'}
          onSubmit={({ name, color, systemPrompt }) => {
            customLensStore.save({ id: initial?.id, name, color, systemPrompt })
            bump()
            close()
          }}
          onCancel={close}
        />
      </div>
    </div>
  )
}
