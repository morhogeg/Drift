import type { Target } from '../types/chat'
import { DUMMY_TARGET } from '../store/modelStore'

interface ModelPickerSheetProps {
  isOpen: boolean
  onClose: () => void
  selectedTargets: Target[]
  onToggleTarget: (target: Target) => void
}

const ALL_MODELS: Target[] = [
  { provider: 'gemini', key: 'gemini-flash-lite', label: 'Gemini Flash Lite' },
  { provider: 'gemini', key: 'gemini-flash', label: 'Gemini Flash' },
  DUMMY_TARGET,
]

const MODEL_DOT_COLORS: Record<string, string> = {
  gemini: 'bg-sky-400',
  openrouter: 'bg-emerald-400',
  ollama: 'bg-amber-400',
  dummy: 'bg-purple-400',
}

export default function ModelPickerSheet({ isOpen, onClose, selectedTargets, onToggleTarget }: ModelPickerSheetProps) {
  if (!isOpen) return null

  const selectedKeys = new Set(selectedTargets.map(t => t.key))

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-dark-surface border-t border-dark-border/60 px-6 py-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-dark-border/80 mx-auto mb-5" />

        <h3 className="text-[15px] font-semibold text-text-primary mb-1">Choose Models</h3>
        <p className="text-[12px] text-text-muted mb-5">Select up to 3 models to compare responses</p>

        <div className="space-y-2">
          {ALL_MODELS.map((model) => {
            const isSelected = selectedKeys.has(model.key)
            const isDisabled = !isSelected && selectedTargets.length >= 3

            return (
              <button
                key={model.key}
                onClick={() => {
                  if (!isDisabled) onToggleTarget(model)
                }}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                  isSelected
                    ? 'bg-accent-violet/10 border border-accent-violet/40'
                    : isDisabled
                    ? 'bg-dark-elevated/40 border border-dark-border/30 opacity-40 cursor-default'
                    : 'bg-dark-elevated border border-dark-border/60 active:opacity-70'
                }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${MODEL_DOT_COLORS[model.provider] ?? 'bg-text-muted/40'}`} />
                <span className={`flex-1 text-[14px] font-medium ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {model.label}
                </span>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-accent-violet flex items-center justify-center flex-shrink-0">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 py-3 rounded-xl bg-accent-violet text-white text-[14px] font-semibold active:opacity-80 transition-opacity"
        >
          Done
        </button>
      </div>
    </>
  )
}
