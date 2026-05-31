import { useState, useEffect } from 'react'
import { X, ArrowLeft, Eye, EyeOff, Loader2, Search, ChevronRight, Plus } from 'lucide-react'
import { checkGeminiConnection, GEMINI_MODELS } from '../services/gemini'
import { checkOpenRouterConnection, listAvailableModels as listOpenRouterModels } from '../services/openrouter'
import { checkOllamaConnection, listAvailableModels as listOllamaModels } from '../services/ollama'
import type { ModelPreset, Provider } from './Settings'

interface AddModelSheetProps {
  isOpen: boolean
  onClose: () => void
  currentPresets: ModelPreset[]
  onPresetsAdded: (presets: ModelPreset[]) => void
  maxAdd: number
}

// ── Provider catalogue — the one place a new provider gets registered ───────────
interface ProviderMeta {
  id: Provider
  name: string
  tagline: string
  dot: string
  /** What the connect step needs before we can list models. */
  needs: 'apiKey' | 'serverUrl' | 'none'
  /** Helper shown under the credential field. */
  hint?: string
  keyPlaceholder?: string
}

const PROVIDERS: ProviderMeta[] = [
  { id: 'gemini', name: 'Google Gemini', tagline: 'Free keys · fast & capable', dot: 'bg-sky-400', needs: 'apiKey', hint: 'aistudio.google.com — free API keys', keyPlaceholder: 'AIza...' },
  { id: 'openrouter', name: 'OpenRouter', tagline: 'Hundreds of models, one key', dot: 'bg-blue-400', needs: 'apiKey', hint: 'openrouter.ai/keys — free tier available', keyPlaceholder: 'sk-or-v1-...' },
  { id: 'ollama', name: 'Ollama', tagline: 'Local models on your machine', dot: 'bg-emerald-400', needs: 'serverUrl', hint: 'Runs fully offline — no key required', keyPlaceholder: 'http://localhost:11434' },
  { id: 'dummy', name: 'Demo AI', tagline: 'Simulated replies — no key', dot: 'bg-violet-400', needs: 'none' },
]

// Curated Gemini line-up (kept stable ids so existing presets upsert cleanly).
const GEMINI_OPTIONS: ModelOption[] = [
  { key: 'gemini-flash-25', label: 'Gemini 2.5 Flash', model: GEMINI_MODELS.FLASH_25, desc: 'Latest & most capable' },
  { key: 'gemini-flash', label: 'Gemini Flash Preview', model: GEMINI_MODELS.FLASH_PREVIEW, desc: 'Balanced speed & quality' },
  { key: 'gemini-flash-20', label: 'Gemini 2.0 Flash', model: GEMINI_MODELS.FLASH_20, desc: 'Fast & reliable' },
  { key: 'gemini-flash-lite', label: 'Gemini Flash Lite', model: GEMINI_MODELS.FLASH_LITE_PREVIEW, desc: 'Fastest, free tier' },
]

interface ModelOption {
  key: string
  label: string
  model: string
  desc?: string
}

type Phase = 'provider' | 'connect' | 'validating' | 'model-select'

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()

export default function AddModelSheet({
  isOpen,
  onClose,
  currentPresets,
  onPresetsAdded,
  maxAdd,
}: AddModelSheetProps) {
  const [phase, setPhase] = useState<Phase>('provider')
  const [provider, setProvider] = useState<Provider>('gemini')
  const [credential, setCredential] = useState('')   // apiKey or serverUrl
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<ModelOption[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Map<string, ModelOption>>(new Map())

  const meta = PROVIDERS.find((p) => p.id === provider)!

  // Reset whenever the sheet opens.
  useEffect(() => {
    if (isOpen) {
      setPhase('provider')
      setProvider('gemini')
      setCredential('')
      setShowKey(false)
      setError(null)
      setOptions([])
      setSearch('')
      setSelected(new Map())
    }
  }, [isOpen])

  if (!isOpen) return null

  // ── Provider picked ───────────────────────────────────────────────────────────
  const pickProvider = (p: ProviderMeta) => {
    setProvider(p.id)
    setError(null)
    setCredential(p.id === 'ollama' ? 'http://localhost:11434' : '')
    setSelected(new Map())
    setSearch('')
    if (p.needs === 'none') {
      // Demo AI — add immediately, nothing to configure.
      onPresetsAdded([{ id: 'dummy-lite', provider: 'dummy', label: 'Demo AI', enabled: true }])
      onClose()
      return
    }
    setPhase('connect')
  }

  // ── Connect: validate credential, then load the model list ──────────────────────
  const handleConnect = async () => {
    const value = credential.trim()
    if (!value) {
      setError(meta.needs === 'serverUrl' ? 'Enter your server URL.' : 'Enter your API key.')
      return
    }
    setError(null)
    setPhase('validating')
    try {
      let ok = false
      if (provider === 'gemini') ok = await checkGeminiConnection(value)
      else if (provider === 'openrouter') ok = await checkOpenRouterConnection(value)
      else if (provider === 'ollama') ok = await checkOllamaConnection(value)

      if (!ok) {
        setError(
          provider === 'ollama'
            ? "Couldn't reach that Ollama server. Is it running?"
            : 'Invalid API key. Double-check and try again.',
        )
        setPhase('connect')
        return
      }
      await loadModels(value)
      setPhase('model-select')
    } catch {
      setError(provider === 'ollama' ? 'Could not reach the server.' : 'Could not reach the provider. Check your connection.')
      setPhase('connect')
    }
  }

  const loadModels = async (value: string) => {
    if (provider === 'gemini') {
      setOptions(GEMINI_OPTIONS)
      return
    }
    setLoadingModels(true)
    try {
      if (provider === 'openrouter') {
        const list = await listOpenRouterModels(value)
        setOptions(
          list.map((m) => ({
            key: `or-${slug(m.id)}`,
            label: m.name || m.id,
            model: m.id,
            desc: m.id.endsWith(':free') ? 'Free' : undefined,
          })),
        )
      } else if (provider === 'ollama') {
        const tags = await listOllamaModels(value)
        setOptions(tags.map((t) => ({ key: `ollama-${slug(t)}`, label: t, model: t })))
      }
    } finally {
      setLoadingModels(false)
    }
  }

  // ── Selection ───────────────────────────────────────────────────────────────────
  const toggle = (opt: ModelOption) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(opt.key)) next.delete(opt.key)
      else if (next.size < maxAdd) next.set(opt.key, opt)
      return next
    })
  }

  const addCustom = () => {
    const m = search.trim()
    if (!m) return
    const opt: ModelOption = {
      key: `${provider === 'openrouter' ? 'or' : 'ollama'}-${slug(m)}`,
      label: m,
      model: m,
      desc: 'Custom',
    }
    setOptions((prev) => (prev.some((o) => o.model === m) ? prev : [opt, ...prev]))
    toggle(opt)
    setSearch('')
  }

  const handleAdd = () => {
    const value = credential.trim()
    const presets: ModelPreset[] = []
    for (const opt of selected.values()) {
      const existing = currentPresets.find((p) => p.id === opt.key)
      const base: ModelPreset = existing
        ? { ...existing, enabled: true }
        : { id: opt.key, provider, label: opt.label, enabled: true }
      base.model = opt.model
      base.label = opt.label
      if (provider === 'ollama') base.serverUrl = value
      else base.apiKey = value
      presets.push(base)
    }
    if (presets.length > 0) onPresetsAdded(presets)
    onClose()
  }

  const atMax = selected.size >= maxAdd
  const usesSearch = provider === 'openrouter' || provider === 'ollama'
  const filtered = usesSearch && search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()) || o.model.toLowerCase().includes(search.toLowerCase()))
    : options
  const exactMatch = options.some((o) => o.model.toLowerCase() === search.trim().toLowerCase())

  const headerTitle =
    phase === 'provider' ? 'Add a model' :
    phase === 'model-select' ? `Choose ${meta.name} models` :
    `Connect ${meta.name}`

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      <div
        className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl bg-dark-surface border-t border-dark-border/60 max-h-[88dvh] flex flex-col"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-dark-border/80 mx-auto mt-3 mb-1 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center px-5 py-3 flex-shrink-0">
          {phase !== 'provider' ? (
            <button
              onClick={() => { setPhase(phase === 'model-select' ? 'connect' : 'provider'); setError(null) }}
              className="p-1.5 -ml-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="w-8" />
          )}
          <div className="flex-1 text-center">
            <h3 className="text-[15px] font-semibold text-text-primary">{headerTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Provider select ────────────────────────────────────────────────────── */}
        {phase === 'provider' && (
          <div className="px-5 pb-2 flex flex-col gap-2 overflow-y-auto">
            <p className="text-[12px] text-text-muted mb-1">Pick a provider — Drift works with any of them.</p>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => pickProvider(p)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-dark-elevated border border-dark-border/60 active:opacity-70 hover:border-accent-violet/40 transition-all text-left"
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">{p.name}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{p.tagline}</p>
                </div>
                <ChevronRight size={16} className="text-text-muted flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* ── Connect / Validating ──────────────────────────────────────────────── */}
        {(phase === 'connect' || phase === 'validating') && (
          <div className="px-5 pb-2 flex flex-col gap-4">
            {/* Provider badge */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-dark-elevated/60 border border-dark-border/50">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/[0.05]">
                <span className={`w-3 h-3 rounded-full ${meta.dot}`} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-text-primary">{meta.name}</p>
                {meta.hint && <p className="text-[11px] text-text-muted">{meta.hint}</p>}
              </div>
            </div>

            {/* Credential input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-widest uppercase text-text-muted">
                {meta.needs === 'serverUrl' ? 'Server URL' : 'API Key'}
              </label>
              <div className="relative flex items-center">
                <input
                  type={meta.needs === 'serverUrl' || showKey ? 'text' : 'password'}
                  value={credential}
                  onChange={(e) => { setCredential(e.target.value); setError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && phase === 'connect') handleConnect() }}
                  placeholder={meta.keyPlaceholder}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={phase === 'validating'}
                  className="w-full bg-dark-elevated border border-dark-border/60 rounded-xl px-4 py-3 pr-12 text-[14px] text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-accent-violet/60 transition-colors disabled:opacity-50"
                />
                {meta.needs === 'apiKey' && (
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 p-1 text-text-muted hover:text-text-secondary transition-colors"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
              {error && <p className="text-[12px] text-red-400">{error}</p>}
            </div>

            <button
              onClick={phase === 'connect' ? handleConnect : undefined}
              disabled={phase === 'validating' || !credential.trim()}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-semibold transition-all ${
                phase === 'validating' || !credential.trim()
                  ? 'bg-dark-elevated text-text-muted cursor-default'
                  : 'bg-gradient-to-r from-pink-500 to-violet-500 text-white active:opacity-80 shadow-[0_4px_14px_rgba(168,85,247,0.25)]'
              }`}
            >
              {phase === 'validating' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {meta.needs === 'serverUrl' ? 'Reaching server...' : 'Verifying key...'}
                </>
              ) : (
                'Connect →'
              )}
            </button>
          </div>
        )}

        {/* ── Model select ──────────────────────────────────────────────────────── */}
        {phase === 'model-select' && (
          <div className="px-5 pb-2 flex flex-col gap-3 overflow-hidden">
            <p className="text-[12px] text-text-muted -mt-1 flex-shrink-0">
              {maxAdd > 1 ? `Select up to ${maxAdd} model${maxAdd > 1 ? 's' : ''}` : 'Select a model to add'}
            </p>

            {/* Search (OpenRouter / Ollama) */}
            {usesSearch && (
              <div className="relative flex items-center flex-shrink-0">
                <Search size={15} className="absolute left-3 text-text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !exactMatch && search.trim()) addCustom() }}
                  placeholder={provider === 'openrouter' ? 'Search or paste a model ID…' : 'Search or type a model name…'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-dark-elevated border border-dark-border/60 rounded-xl pl-9 pr-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-accent-violet/60 transition-colors"
                />
              </div>
            )}

            <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
              {loadingModels && (
                <div className="flex items-center justify-center gap-2 py-8 text-text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-[13px]">Loading models…</span>
                </div>
              )}

              {/* Custom model entry — when search has no exact match */}
              {usesSearch && !loadingModels && search.trim() && !exactMatch && (
                <button
                  onClick={addCustom}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-accent-violet/[0.07] border border-dashed border-accent-violet/40 active:opacity-70 transition-all text-left"
                >
                  <Plus size={16} className="text-accent-violet flex-shrink-0" />
                  <span className="text-[13px] text-text-primary truncate">
                    Use “<span className="font-medium">{search.trim()}</span>”
                  </span>
                </button>
              )}

              {!loadingModels && filtered.map((opt) => {
                const isSelected = selected.has(opt.key)
                const alreadyAdded = currentPresets.some((p) => p.id === opt.key && p.enabled)
                const isDisabled = !isSelected && !alreadyAdded && atMax
                return (
                  <button
                    key={opt.key}
                    onClick={() => { if (!alreadyAdded) toggle(opt) }}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                      alreadyAdded
                        ? 'bg-dark-elevated/40 border border-dark-border/30 opacity-60 cursor-default'
                        : isSelected
                        ? 'bg-accent-violet/10 border border-accent-violet/40'
                        : isDisabled
                        ? 'bg-dark-elevated/30 border border-dark-border/20 opacity-40 cursor-default'
                        : 'bg-dark-elevated border border-dark-border/60 active:opacity-70'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot} ${alreadyAdded ? 'opacity-40' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium truncate ${alreadyAdded || isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {opt.label}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5 truncate">
                        {alreadyAdded ? 'Already in your models' : (opt.desc || opt.model)}
                      </p>
                    </div>
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        alreadyAdded ? 'bg-dark-border/40' : isSelected ? 'bg-accent-violet' : 'border-2 border-dark-border/60'
                      }`}
                    >
                      {(alreadyAdded || isSelected) && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke={alreadyAdded ? '#6b7280' : 'white'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  </button>
                )
              })}

              {!loadingModels && filtered.length === 0 && !(usesSearch && search.trim()) && (
                <p className="text-[12px] text-text-muted text-center py-6">
                  No models found.{usesSearch ? ' Type a model name above to add one.' : ''}
                </p>
              )}
            </div>

            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              className={`w-full mt-1 py-3.5 rounded-xl text-[14px] font-semibold transition-all flex-shrink-0 ${
                selected.size === 0
                  ? 'bg-dark-elevated text-text-muted cursor-default'
                  : 'bg-gradient-to-r from-pink-500 to-violet-500 text-white active:opacity-80 shadow-[0_4px_14px_rgba(168,85,247,0.25)]'
              }`}
            >
              {selected.size === 0 ? 'Select a model' : `Add ${selected.size} model${selected.size > 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
