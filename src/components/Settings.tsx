import { useState, useEffect, useMemo } from 'react'
import { X, Save, Eye, EyeOff, CheckCircle, AlertCircle, Plus, Trash2, RefreshCw, Copy, ChevronRight } from 'lucide-react'
import type { OpenRouterModel } from '../services/openrouter'
import { checkOpenRouterConnection, OPENROUTER_MODELS } from '../services/openrouter'
import { checkOllamaConnection } from '../services/ollama'
import type { GeminiModel } from '../services/gemini'
import { checkGeminiConnection, GEMINI_MODELS } from '../services/gemini'
import { useUIStore } from '../store/uiStore'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  onSave: (settings: AISettings) => void
  currentSettings: AISettings
}

export interface AISettings {
  useOpenRouter: boolean
  useDummyAI: boolean
  openRouterApiKey: string
  openRouterModel: OpenRouterModel
  geminiApiKey: string
  geminiModel: GeminiModel
  ollamaUrl: string
  ollamaModel: string
  modelPresets: ModelPreset[]
}

export type Provider = 'openrouter' | 'ollama' | 'dummy' | 'gemini'

export interface ModelPreset {
  id: string
  provider: Provider
  label: string
  // For OpenRouter presets, the canonical model ID (e.g. "openai/gpt-oss-20b:free")
  model?: string
  // For Ollama presets
  serverUrl?: string
  enabled: boolean
  apiKey?: string
}

// ─── Pill toggle switch ───────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet ${
        checked ? 'bg-accent-violet' : 'bg-dark-border/60'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 pt-5 pb-1.5">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">
        {label}
      </span>
    </div>
  )
}

// ─── Grouped card wrapper ─────────────────────────────────────────────────────
function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 rounded-xl bg-dark-elevated/50 border border-dark-border/50 divide-y divide-dark-border/40 overflow-hidden">
      {children}
    </div>
  )
}

// ─── Simple row (label + right content) ──────────────────────────────────────
function SettingsRow({
  label,
  description,
  right,
  onClick,
}: {
  label: string
  description?: string
  right?: React.ReactNode
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-4 px-4 min-h-[52px] py-3 text-left transition-colors ${
        onClick ? 'hover:bg-dark-elevated/80 active:bg-dark-elevated cursor-pointer' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm text-text-primary leading-snug">{label}</p>
        {description && (
          <p className="text-xs text-text-muted mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      {right && <div className="flex-shrink-0 flex items-center gap-2">{right}</div>}
    </Tag>
  )
}

// ─── Provider dot ─────────────────────────────────────────────────────────────
function ProviderDot({ provider }: { provider: Provider }) {
  const color =
    provider === 'gemini' ? 'bg-sky-400' :
    provider === 'openrouter' ? 'bg-blue-400' :
    provider === 'ollama' ? 'bg-emerald-400' :
    'bg-violet-400'
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
}

// ─── Provider label ───────────────────────────────────────────────────────────
const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  dummy: 'Dummy',
}

// ─── Expanded preset form ─────────────────────────────────────────────────────
function PresetForm({
  preset,
  settings,
  onUpdate,
  onRemove,
  openRouterModelOptions,
  onRefreshOrModels,
}: {
  preset: ModelPreset
  settings: AISettings
  onUpdate: (patch: Partial<ModelPreset>) => void
  onRemove: () => void
  openRouterModelOptions: string[]
  onRefreshOrModels: () => void
}) {
  const [showKey, setShowKey] = useState(false)

  return (
    <div className="border border-dark-border/50 rounded-xl overflow-hidden bg-dark-elevated/40">
      {/* Preset header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-border/40 bg-dark-bg/40">
        <ProviderDot provider={preset.provider} />
        <input
          type="text"
          value={preset.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-text-primary focus:outline-none placeholder-text-muted"
          placeholder="Model name"
        />
        <Toggle checked={preset.enabled} onChange={(v) => onUpdate({ enabled: v })} />
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Provider selector */}
        <div>
          <p className="text-xs text-text-muted mb-2">Provider</p>
          <div className="inline-flex rounded-lg border border-dark-border/60 bg-dark-bg/60 p-0.5 gap-0.5">
            {(['gemini', 'openrouter', 'ollama', 'dummy'] as Provider[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => onUpdate({ provider: p })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  preset.provider === p
                    ? 'bg-dark-elevated text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Provider-specific fields */}
        {preset.provider === 'gemini' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-muted mb-1.5">Model</p>
              <select
                value={preset.model || settings.geminiModel}
                onChange={(e) => onUpdate({ model: e.target.value })}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-violet/50 appearance-none"
              >
                {Object.entries(GEMINI_MODELS).map(([, id]) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">API Key</p>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={preset.apiKey ?? settings.geminiApiKey}
                  onChange={(e) => onUpdate({ apiKey: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full pl-3 pr-18 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet/50"
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <button type="button" onClick={() => setShowKey(v => !v)} className="p-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors">
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(preset.apiKey || settings.geminiApiKey || '')} className="p-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-text-muted/60 mt-1">Used as the global Gemini key</p>
            </div>
          </div>
        )}

        {preset.provider === 'openrouter' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-muted mb-1.5">Model ID</p>
              <div className="flex gap-2">
                <input
                  list={`or-models-${preset.id}`}
                  value={preset.model || ''}
                  onChange={(e) => onUpdate({ model: e.target.value })}
                  placeholder="e.g. openai/gpt-4o"
                  className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet/50"
                />
                <datalist id={`or-models-${preset.id}`}>
                  {openRouterModelOptions.map(m => (<option key={m} value={m} />))}
                </datalist>
                <button
                  type="button"
                  onClick={onRefreshOrModels}
                  className="px-3 py-2 rounded-lg bg-dark-bg border border-dark-border/60 text-text-muted hover:text-text-primary hover:border-accent-violet/40 transition-colors"
                  title="Refresh available models"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">API Key <span className="text-text-muted/50">(optional)</span></p>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={preset.apiKey || ''}
                  onChange={(e) => onUpdate({ apiKey: e.target.value })}
                  placeholder="sk-or-v1-..."
                  className="w-full pl-3 pr-18 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet/50"
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <button type="button" onClick={() => setShowKey(v => !v)} className="p-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors">
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(preset.apiKey || '')} className="p-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-text-muted/60 mt-1">Used as the global OpenRouter key</p>
            </div>
          </div>
        )}

        {preset.provider === 'ollama' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-muted mb-1.5">Server URL</p>
              <input
                type="text"
                value={preset.serverUrl || settings.ollamaUrl}
                onChange={(e) => onUpdate({ serverUrl: e.target.value })}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet/50"
              />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1.5">Model</p>
              <input
                type="text"
                value={preset.model || settings.ollamaModel}
                onChange={(e) => onUpdate({ model: e.target.value })}
                placeholder="llama3, mistral, codellama..."
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet/50"
              />
            </div>
          </div>
        )}

        {preset.provider === 'dummy' && (
          <p className="text-xs text-text-muted">
            No configuration required. Dummy AI simulates responses for testing without using API credits.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

function SettingsInner({ isOpen, onClose, onSave, currentSettings }: SettingsProps) {
  const { theme, setTheme } = useUIStore()
  const [settings, setSettings] = useState<AISettings>(currentSettings)
  const [hasChanges, setHasChanges] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | null>(null)
  const [availableOpenRouterModels, setAvailableOpenRouterModels] = useState<string[]>([])
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null)

  useEffect(() => {
    setSettings(currentSettings)
    setHasChanges(false)
  }, [currentSettings])

  useEffect(() => {
    if (isOpen) {
      checkConnection()
      fetchOpenRouterModels()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && hasChanges) {
      const timeoutId = setTimeout(() => {
        checkConnection()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [settings.openRouterApiKey, settings.openRouterModel, settings.ollamaUrl, settings.ollamaModel, settings.useOpenRouter])

  const checkConnection = async () => {
    if (settings.useDummyAI) {
      setConnectionStatus('connected')
      return
    }
    setConnectionStatus('checking')
    try {
      let connected = false
      const hasGeminiPreset = (settings.modelPresets || []).some(p => p.provider === 'gemini' && p.enabled)
      if (hasGeminiPreset && settings.geminiApiKey) {
        connected = await checkGeminiConnection(settings.geminiApiKey, settings.geminiModel)
      } else if (settings.useOpenRouter && settings.openRouterApiKey) {
        connected = await checkOpenRouterConnection(settings.openRouterApiKey, settings.openRouterModel)
      } else if (!settings.useOpenRouter && !settings.useDummyAI && settings.ollamaUrl) {
        connected = await checkOllamaConnection(settings.ollamaUrl)
      }
      setConnectionStatus(connected ? 'connected' : 'disconnected')
    } catch (error) {
      console.error('Connection check error:', error)
      setConnectionStatus('disconnected')
    }
  }

  const handleChange = (key: keyof AISettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    onSave(settings)
    setHasChanges(false)
    setConnectionStatus(null)
    onClose()
  }

  const handleCancel = () => {
    setSettings(currentSettings)
    setHasChanges(false)
    setConnectionStatus(null)
    onClose()
  }

  const addPreset = () => {
    const id = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const next: ModelPreset = {
      id,
      provider: 'openrouter',
      label: 'New Model',
      model: settings.openRouterModel || OPENROUTER_MODELS.OSS,
      enabled: true,
    }
    handleChange('modelPresets', [...(settings.modelPresets || []), next])
    setExpandedPreset(id)
  }

  const removePreset = (id: string) => {
    handleChange('modelPresets', (settings.modelPresets || []).filter(p => p.id !== id))
    if (expandedPreset === id) setExpandedPreset(null)
  }

  const updatePreset = (id: string, patch: Partial<ModelPreset>) => {
    const next = (settings.modelPresets || []).map(p => p.id === id ? { ...p, ...patch } : p)
    handleChange('modelPresets', next)
    // Sync per-preset API key to the corresponding global key
    if (patch.apiKey !== undefined) {
      const preset = (settings.modelPresets || []).find(p => p.id === id)
      const provider = patch.provider ?? preset?.provider
      if (provider === 'gemini') {
        handleChange('geminiApiKey', patch.apiKey)
      } else if (provider === 'openrouter') {
        handleChange('openRouterApiKey', patch.apiKey)
      }
    }
  }

  const fetchOpenRouterModels = async () => {
    try {
      if (!settings.openRouterApiKey) return
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${settings.openRouterApiKey}`,
          'HTTP-Referer': window.location.origin || 'http://localhost:3000',
          'X-Title': 'Drift AI Chat',
        },
      })
      if (!res.ok) return
      const data = await res.json()
      const ids = (data?.data || []).map((m: any) => m.id).filter(Boolean)
      if (Array.isArray(ids) && ids.length) setAvailableOpenRouterModels(ids)
    } catch {
      // ignore
    }
  }

  const openRouterModelOptions = useMemo(() => {
    const base = [OPENROUTER_MODELS.OSS, OPENROUTER_MODELS.QWEN3]
    const extra = availableOpenRouterModels.filter(m => !base.includes(m as any))
    return [...base, ...extra]
  }, [availableOpenRouterModels])

  const presets = settings.modelPresets || []

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Panel — slides in from the right */}
      <div className="relative ml-auto w-full max-w-md h-full flex flex-col bg-dark-surface border-l border-dark-border/60 shadow-[−20px_0_60px_rgba(0,0,0,0.5)] animate-slide-in overflow-hidden">
        {/* Subtle gradient accent at top */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-violet/60 to-transparent" />

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-dark-border/40">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-dark-elevated transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-[17px] font-semibold text-text-primary tracking-tight">AI Settings</h2>
          </div>
          {connectionStatus && (
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              connectionStatus === 'connected'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : connectionStatus === 'checking'
                ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                : 'bg-red-500/10 border-red-500/25 text-red-300'
            }`}>
              {connectionStatus === 'connected' && <CheckCircle className="w-3 h-3" />}
              {connectionStatus === 'checking' && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
              {connectionStatus === 'disconnected' && <AlertCircle className="w-3 h-3" />}
              {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'checking' ? 'Checking' : 'Offline'}
            </span>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-28">

          {/* ── MODELS section ── */}
          <SectionHeader label="Models" />
          <SettingsGroup>
            {presets.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <p className="text-sm text-text-muted">No models configured yet.</p>
                <p className="text-xs text-text-muted/60 mt-1">Tap the button below to add your first model.</p>
              </div>
            ) : (
              presets.map((preset, idx) => (
                <div key={preset.id}>
                  {/* Collapsed row */}
                  {expandedPreset !== preset.id ? (
                    <div className="flex items-center gap-3 px-4 min-h-[52px] py-2.5 transition-colors hover:bg-dark-elevated/40">
                      <ProviderDot provider={preset.provider} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{preset.label}</p>
                        <p className="text-xs text-text-muted">{PROVIDER_LABELS[preset.provider]}{preset.model ? ` · ${preset.model.split('/').pop()}` : ''}</p>
                      </div>
                      <Toggle
                        checked={preset.enabled}
                        onChange={(v) => updatePreset(preset.id, { enabled: v })}
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedPreset(preset.id)}
                        className="p-1.5 rounded-md text-text-muted hover:text-text-primary transition-colors"
                        title="Configure"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    /* Expanded form */
                    <div className="p-3">
                      <PresetForm
                        preset={preset}
                        settings={settings}
                        onUpdate={(patch) => updatePreset(preset.id, patch)}
                        onRemove={() => removePreset(preset.id)}
                        openRouterModelOptions={openRouterModelOptions}
                        onRefreshOrModels={fetchOpenRouterModels}
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedPreset(null)}
                        className="mt-2 w-full py-1.5 text-xs text-text-muted hover:text-text-primary text-center transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  )}
                  {idx < presets.length - 1 && expandedPreset !== preset.id && (
                    <div className="h-px bg-dark-border/40 mx-4" />
                  )}
                </div>
              ))
            )}
          </SettingsGroup>

          {/* Add model button */}
          <div className="mx-4 mt-2">
            <button
              type="button"
              onClick={addPreset}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-dark-border/60 text-text-muted hover:text-accent-violet hover:border-accent-violet/40 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Model
            </button>
          </div>

          {/* ── APPEARANCE section ── */}
          <SectionHeader label="Appearance" />
          <SettingsGroup>
            <SettingsRow
              label="Theme"
              description={theme === 'dark' ? 'Dark mode' : 'Light mode'}
              right={
                <Toggle
                  checked={theme === 'dark'}
                  onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
              }
            />
          </SettingsGroup>

          {/* ── ADVANCED section ── */}
          <SectionHeader label="Advanced" />
          <SettingsGroup>
            <SettingsRow
              label="Dummy AI"
              description="Simulate responses without API credits"
              right={
                <Toggle
                  checked={settings.useDummyAI}
                  onChange={(v) => {
                    handleChange('useDummyAI', v)
                    if (v) handleChange('useOpenRouter', false)
                  }}
                />
              }
            />
            <div className="h-px bg-dark-border/40" />
            <SettingsRow
              label="Test Connection"
              right={
                <button
                  type="button"
                  onClick={checkConnection}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border/60 text-text-muted hover:text-text-primary hover:border-accent-violet/40 transition-colors text-xs"
                >
                  <RefreshCw className="w-3 h-3" />
                  Check
                </button>
              }
            />
          </SettingsGroup>

          <div className="h-4" />
        </div>

        {/* ── Footer ── */}
        <div className="absolute bottom-0 left-0 right-0 px-5 py-4 border-t border-dark-border/40 bg-dark-surface/95 backdrop-blur-sm flex items-center justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
              hasChanges
                ? 'bg-gradient-to-r from-accent-violet to-accent-pink text-white hover:opacity-90 shadow-lg shadow-accent-violet/20'
                : 'bg-dark-elevated/60 text-text-muted cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Settings(props: SettingsProps) {
  if (!props.isOpen) return null
  return <SettingsInner {...props} />
}
