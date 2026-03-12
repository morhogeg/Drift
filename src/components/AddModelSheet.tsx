import { useState, useEffect } from 'react'
import { X, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { checkGeminiConnection, GEMINI_MODELS } from '../services/gemini'
import type { ModelPreset } from './Settings'

interface AddModelSheetProps {
  isOpen: boolean
  onClose: () => void
  currentPresets: ModelPreset[]
  onPresetsAdded: (presets: ModelPreset[]) => void
  maxAdd: number
}

const GEMINI_OPTIONS = [
  {
    id: 'gemini-flash-25',
    label: 'Gemini 2.5 Flash',
    model: GEMINI_MODELS.FLASH_25,
    desc: 'Latest & most capable',
  },
  {
    id: 'gemini-flash',
    label: 'Gemini Flash Preview',
    model: GEMINI_MODELS.FLASH_PREVIEW,
    desc: 'Balanced speed & quality',
  },
  {
    id: 'gemini-flash-20',
    label: 'Gemini 2.0 Flash',
    model: GEMINI_MODELS.FLASH_20,
    desc: 'Fast & reliable',
  },
  {
    id: 'gemini-flash-lite',
    label: 'Gemini Flash Lite',
    model: GEMINI_MODELS.FLASH_LITE_PREVIEW,
    desc: 'Fastest, free tier',
  },
] as const

type Phase = 'entry' | 'validating' | 'model-select'

export default function AddModelSheet({
  isOpen,
  onClose,
  currentPresets,
  onPresetsAdded,
  maxAdd,
}: AddModelSheetProps) {
  const [phase, setPhase] = useState<Phase>('entry')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reset state whenever the sheet opens
  useEffect(() => {
    if (isOpen) {
      setPhase('entry')
      setApiKey('')
      setShowKey(false)
      setError(null)
      setSelectedIds(new Set())
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleConnect = async () => {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      setError('Please enter your API key.')
      return
    }
    setError(null)
    setPhase('validating')
    try {
      const ok = await checkGeminiConnection(trimmed)
      if (!ok) {
        setError('Invalid API key. Double-check and try again.')
        setPhase('entry')
        return
      }
      setPhase('model-select')
    } catch {
      setError('Could not reach Gemini. Check your connection.')
      setPhase('entry')
    }
  }

  const toggleModel = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < maxAdd) {
        next.add(id)
      }
      return next
    })
  }

  const handleAdd = () => {
    const trimmed = apiKey.trim()
    const newPresets: ModelPreset[] = []
    for (const option of GEMINI_OPTIONS) {
      if (!selectedIds.has(option.id)) continue
      const existing = currentPresets.find((p) => p.id === option.id)
      if (existing) {
        // Update existing preset's API key
        newPresets.push({ ...existing, apiKey: trimmed, enabled: true })
      } else {
        newPresets.push({
          id: option.id,
          provider: 'gemini',
          label: option.label,
          model: option.model,
          enabled: true,
          apiKey: trimmed,
        })
      }
    }
    if (newPresets.length > 0) onPresetsAdded(newPresets)
    onClose()
  }

  const isAtMax = selectedIds.size >= maxAdd

  return (
    <>
      {/* Backdrop — slightly lighter so ModelPickerSheet is still hinted behind */}
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl bg-dark-surface border-t border-dark-border/60"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-dark-border/80 mx-auto mt-3 mb-1 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center px-5 py-3">
          {phase === 'model-select' ? (
            <button
              onClick={() => setPhase('entry')}
              className="p-1.5 -ml-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="w-8" />
          )}
          <div className="flex-1 text-center">
            <h3 className="text-[15px] font-semibold text-text-primary">
              {phase === 'model-select' ? 'Choose Models' : 'Connect Gemini'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Entry / Validating ─────────────────────────────────────────────── */}
        {(phase === 'entry' || phase === 'validating') && (
          <div className="px-5 pb-2 flex flex-col gap-4">
            {/* Provider badge */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-sky-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-sky-300">Google AI Studio</p>
                <p className="text-[11px] text-sky-400/60">aistudio.google.com — free API keys</p>
              </div>
            </div>

            {/* API key input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-widest uppercase text-text-muted">
                API Key
              </label>
              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && phase === 'entry') handleConnect()
                  }}
                  placeholder="AIza..."
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={phase === 'validating'}
                  className="w-full bg-dark-elevated border border-dark-border/60 rounded-xl px-4 py-3 pr-12 text-[14px] text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-accent-violet/60 transition-colors disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 p-1 text-text-muted hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {error && <p className="text-[12px] text-red-400">{error}</p>}
            </div>

            {/* Connect button */}
            <button
              onClick={phase === 'entry' ? handleConnect : undefined}
              disabled={phase === 'validating' || !apiKey.trim()}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-semibold transition-all ${
                phase === 'validating' || !apiKey.trim()
                  ? 'bg-dark-elevated text-text-muted cursor-default'
                  : 'bg-gradient-to-r from-pink-500 to-violet-500 text-white active:opacity-80 shadow-[0_4px_14px_rgba(168,85,247,0.25)]'
              }`}
            >
              {phase === 'validating' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying key...
                </>
              ) : (
                'Connect →'
              )}
            </button>
          </div>
        )}

        {/* ── Model select ───────────────────────────────────────────────────── */}
        {phase === 'model-select' && (
          <div className="px-5 pb-2 flex flex-col gap-3">
            <p className="text-[12px] text-text-muted -mt-1">
              {maxAdd > 1
                ? `Select up to ${maxAdd} model${maxAdd > 1 ? 's' : ''} to add`
                : 'Select a model to add'}
            </p>

            <div className="space-y-2">
              {GEMINI_OPTIONS.map((option) => {
                const isSelected = selectedIds.has(option.id)
                const alreadyAdded = currentPresets.some(
                  (p) => p.id === option.id && p.enabled,
                )
                const isDisabled = !isSelected && !alreadyAdded && isAtMax

                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      if (!alreadyAdded) toggleModel(option.id)
                    }}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left ${
                      alreadyAdded
                        ? 'bg-dark-elevated/40 border border-dark-border/30 opacity-60 cursor-default'
                        : isSelected
                        ? 'bg-accent-violet/10 border border-accent-violet/40'
                        : isDisabled
                        ? 'bg-dark-elevated/30 border border-dark-border/20 opacity-40 cursor-default'
                        : 'bg-dark-elevated border border-dark-border/60 active:opacity-70'
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 bg-sky-400 ${alreadyAdded ? 'opacity-40' : ''}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[13px] font-medium ${
                          alreadyAdded || isSelected
                            ? 'text-text-primary'
                            : 'text-text-secondary'
                        }`}
                      >
                        {option.label}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {alreadyAdded ? 'Already in your models' : option.desc}
                      </p>
                    </div>
                    {/* Checkbox indicator */}
                    {alreadyAdded ? (
                      <div className="w-5 h-5 rounded-full bg-dark-border/40 flex items-center justify-center flex-shrink-0">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="#6b7280"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    ) : isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-accent-violet flex items-center justify-center flex-shrink-0">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-dark-border/60 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleAdd}
              disabled={selectedIds.size === 0}
              className={`w-full mt-1 py-3.5 rounded-xl text-[14px] font-semibold transition-all ${
                selectedIds.size === 0
                  ? 'bg-dark-elevated text-text-muted cursor-default'
                  : 'bg-gradient-to-r from-pink-500 to-violet-500 text-white active:opacity-80 shadow-[0_4px_14px_rgba(168,85,247,0.25)]'
              }`}
            >
              {selectedIds.size === 0
                ? 'Select a model'
                : `Add ${selectedIds.size} model${selectedIds.size > 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
