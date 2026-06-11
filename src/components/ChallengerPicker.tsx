import { Scale, Check, Plus, X } from 'lucide-react'
import type { Target } from '../types/chat'

const PROVIDER_LABEL: Record<Target['provider'], string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
}

interface ChallengerPickerProps {
  open: boolean
  /** Selectable models — every configured model except the main chat model. */
  options: Target[]
  /** Currently chosen challenger (highlighted), if any. */
  current: Target | null
  onPick: (t: Target) => void
  onClose: () => void
  /** Routes to the model-add flow (Settings) when the user has no second model. */
  onAddModel?: () => void
}

/**
 * Picks the model that powers the Challenge lens — a deliberately *different*
 * voice from the main chat. Shown the first time Challenge is used (and from
 * Settings). Rose-accented to match the Challenge lens everywhere else.
 */
export default function ChallengerPicker({ open, options, current, onPick, onClose, onAddModel }: ChallengerPickerProps) {
  if (!open) return null
  const empty = options.length === 0

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm rounded-2xl overflow-hidden animate-scale-in"
        style={{ background: 'rgb(var(--color-surface))', border: '1px solid rgb(var(--color-border))', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgb(var(--color-border))' }}>
          <span className="flex items-center justify-center w-9 h-9 rounded-full shrink-0" style={{ background: 'rgba(244,63,94,0.14)', border: '1px solid rgba(244,63,94,0.3)' }}>
            <Scale className="w-4 h-4" style={{ color: '#f43f5e' }} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold leading-tight" style={{ color: 'rgb(var(--color-text-primary))' }}>Choose a challenger</h3>
            <p className="text-[11.5px] leading-snug mt-0.5" style={{ color: 'rgb(var(--color-text-muted))' }}>
              Challenge pressure-tests answers with a different model — an independent critic, not the main model second-guessing itself.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 p-1 rounded-lg hover:bg-white/10" style={{ color: 'rgb(var(--color-text-secondary))' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {empty ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[12.5px] leading-snug" style={{ color: 'rgb(var(--color-text-secondary))' }}>
                You only have one model set up. Add a second one — e.g. Claude or Grok via your OpenRouter key — to challenge with a different voice.
              </p>
            </div>
          ) : (
            options.map((opt) => {
              const active = current?.key === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => onPick(opt)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/[0.04]"
                  style={active ? { background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)' } : { border: '1px solid transparent' }}
                >
                  <div className="min-w-0 flex-1">
                    <div dir="auto" className="text-[13px] font-medium truncate" style={{ color: 'rgb(var(--color-text-primary))' }}>{opt.label}</div>
                    <div className="text-[10.5px] mt-0.5" style={{ color: 'rgb(var(--color-text-muted))' }}>{PROVIDER_LABEL[opt.provider]}</div>
                  </div>
                  {active && <Check className="w-4 h-4 shrink-0" style={{ color: '#f43f5e' }} />}
                </button>
              )
            })
          )}
        </div>

        {/* Add-a-model footer */}
        {onAddModel && (
          <button
            onClick={onAddModel}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[12.5px] font-medium transition-colors hover:bg-white/[0.03]"
            style={{ borderTop: '1px solid rgb(var(--color-border))', color: '#d8b4fe' }}
          >
            <Plus className="w-4 h-4" />
            Add a model
          </button>
        )}
      </div>
    </div>
  )
}
