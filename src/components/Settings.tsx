import { useState, useEffect, useMemo } from 'react'
import { X, Save, Eye, EyeOff, Info, ExternalLink, CheckCircle, AlertCircle, Plus, Trash2, RefreshCw, Copy, ToggleLeft, ToggleRight } from 'lucide-react'
import type { OpenRouterModel } from '../services/openrouter'
import { checkOpenRouterConnection, OPENROUTER_MODELS } from '../services/openrouter'
import { checkOllamaConnection } from '../services/ollama'

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
  ollamaUrl: string
  ollamaModel: string
  modelPresets: ModelPreset[]
}

export type Provider = 'openrouter' | 'ollama' | 'dummy'

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

function SettingsInner({ isOpen, onClose, onSave, currentSettings }: SettingsProps) {
  const [settings, setSettings] = useState<AISettings>(currentSettings)
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | null>(null)
  const [availableOpenRouterModels, setAvailableOpenRouterModels] = useState<string[]>([])
  // legacy: previously used tabs; now single screen

  useEffect(() => {
    setSettings(currentSettings)
    setHasChanges(false)
  }, [currentSettings])

  useEffect(() => {
    if (isOpen) {
      // Only check connection when settings modal opens, not on every change
      checkConnection()
      // Attempt to fetch available models from OpenRouter (best-effort)
      fetchOpenRouterModels()
    }
  }, [isOpen])
  
  useEffect(() => {
    // Only check connection when API key or critical settings change after initial load
    if (isOpen && hasChanges) {
      const timeoutId = setTimeout(() => {
        checkConnection()
      }, 500) // Debounce to avoid too many checks while typing
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
      if (settings.useOpenRouter && settings.openRouterApiKey) {
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

  // Inner modal always assumes open; wrapper ensures conditional mount

  const addPreset = () => {
    const id = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
    const next: ModelPreset = { id, provider: 'openrouter', label: 'New Model', model: settings.openRouterModel || OPENROUTER_MODELS.OSS, enabled: true }
    handleChange('modelPresets', [...(settings.modelPresets || []), next])
  }

  const removePreset = (id: string) => {
    handleChange('modelPresets', (settings.modelPresets || []).filter(p => p.id !== id))
  }

  const updatePreset = (id: string, patch: Partial<ModelPreset>) => {
    const next = (settings.modelPresets || []).map(p => p.id === id ? { ...p, ...patch } : p)
    handleChange('modelPresets', next)
  }

  const fetchOpenRouterModels = async () => {
    try {
      // best-effort: only if apiKey present
      if (!settings.openRouterApiKey) return
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${settings.openRouterApiKey}`,
          'HTTP-Referer': window.location.origin || 'http://localhost:3000',
          'X-Title': 'Drift AI Chat'
        }
      })
      if (!res.ok) return
      const data = await res.json()
      const ids = (data?.data || []).map((m: any) => m.id).filter(Boolean)
      if (Array.isArray(ids) && ids.length) setAvailableOpenRouterModels(ids)
    } catch (e) {
      // ignore network issues; fallback to defaults
    }
  }

  const openRouterModelOptions = useMemo(() => {
    const base = [OPENROUTER_MODELS.OSS, OPENROUTER_MODELS.QWEN3]
    const extra = availableOpenRouterModels.filter(m => !base.includes(m as any))
    return [...base, ...extra]
  }, [availableOpenRouterModels])
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-[980px] max-h-[92vh] overflow-hidden rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent-violet/20 via-transparent to-accent-pink/20 pointer-events-none" />
        <div className="relative bg-dark-surface/95 backdrop-blur-md border border-dark-border/60 rounded-2xl flex flex-col h-full">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-dark-border/60">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-[18px] font-semibold text-text-primary tracking-tight">AI Settings</h2>
                  {connectionStatus && (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${
                      connectionStatus === 'connected' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                      connectionStatus === 'checking' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                      'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}>
                      {connectionStatus === 'checking' ? 'Checking' : connectionStatus === 'connected' ? 'Connected' : 'Offline'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-muted">Configure providers and curate model presets for the header picker.</p>
              </div>
              <button onClick={handleCancel} className="p-2 rounded-lg hover:bg-dark-elevated transition-colors" aria-label="Close">
                <X className="w-5 h-5 text-text-muted" />
              </button>
            </div>
            {/* Tabs removed for single-screen simplicity */}
          </div>

          {/* Content */}
          <div className="px-6 py-5 overflow-y-auto overscroll-contain flex-1">
            {false && (
              <div className="space-y-6">
                {/* AI Provider Selection */}
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-3">Active Provider</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => { handleChange('useOpenRouter', true); handleChange('useDummyAI', false) }}
                      className={`p-4 rounded-lg border transition-all ${settings.useOpenRouter && !settings.useDummyAI ? 'bg-gradient-to-r from-accent-violet/20 to-accent-pink/20 border-accent-violet' : 'bg-dark-elevated/60 border-dark-border/60 hover:border-dark-border'}`}
                    >
                      <div className="flex flex-col items-center space-y-1.5">
                        <span className="text-text-primary font-medium">OpenRouter</span>
                        <span className="text-[11px] text-text-muted">Cloud models</span>
                      </div>
                    </button>
                    <button
                      onClick={() => { handleChange('useOpenRouter', false); handleChange('useDummyAI', false) }}
                      className={`p-4 rounded-lg border transition-all ${!settings.useOpenRouter && !settings.useDummyAI ? 'bg-gradient-to-r from-accent-violet/20 to-accent-pink/20 border-accent-violet' : 'bg-dark-elevated/60 border-dark-border/60 hover:border-dark-border'}`}
                    >
                      <div className="flex flex-col items-center space-y-1.5">
                        <span className="text-text-primary font-medium">Ollama</span>
                        <span className="text-[11px] text-text-muted">Local models</span>
                      </div>
                    </button>
                    <button
                      onClick={() => { handleChange('useDummyAI', true); handleChange('useOpenRouter', false) }}
                      className={`p-4 rounded-lg border transition-all ${settings.useDummyAI ? 'bg-gradient-to-r from-accent-violet/20 to-accent-pink/20 border-accent-violet' : 'bg-dark-elevated/60 border-dark-border/60 hover:border-dark-border'}`}
                    >
                      <div className="flex flex-col items-center space-y-1.5">
                        <span className="text-text-primary font-medium">Dummy AI</span>
                        <span className="text-[11px] text-text-muted">For testing</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* OpenRouter Settings */}
                {settings.useOpenRouter && (
                  <div className="mt-2 space-y-4 p-5 bg-dark-elevated/60 rounded-xl border border-dark-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-text-primary font-medium">OpenRouter Configuration</h3>
                        {connectionStatus && (
                          <div className="flex items-center gap-1">
                            {connectionStatus === 'checking' && (<span className="text-xs text-text-muted">Checking...</span>)}
                            {connectionStatus === 'connected' && (<><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500">Connected</span></>)}
                            {connectionStatus === 'disconnected' && (<><AlertCircle className="w-4 h-4 text-red-500" /><span className="text-xs text-red-500">Not connected</span></>)}
                          </div>
                        )}
                      </div>
                      <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-accent-violet hover:text-accent-pink transition-colors">
                        Get API Key
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-text-muted mb-1">API Key</label>
                        <div className="relative">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={settings.openRouterApiKey}
                            onChange={(e) => handleChange('openRouterApiKey', e.target.value)}
                            placeholder="sk-or-v1-..."
                            className="w-full px-3 py-2 pr-20 bg-dark-bg border border-dark-border/60 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet focus:border-transparent"
                          />
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="p-1.5 rounded-md hover:bg-dark-elevated">
                              {showApiKey ? <EyeOff className="w-4 h-4 text-text-muted" /> : <Eye className="w-4 h-4 text-text-muted" />}
                            </button>
                            <button type="button" onClick={() => navigator.clipboard?.writeText(settings.openRouterApiKey || '')} className="p-1.5 rounded-md hover:bg-dark-elevated">
                              <Copy className="w-4 h-4 text-text-muted" />
                            </button>
                          </div>
                        </div>
                        <button onClick={checkConnection} className="mt-2 text-xs text-accent-violet hover:text-accent-pink transition-colors">Test Connection</button>
                      </div>
                      <div>
                        <label className="block text-sm text-text-muted mb-1">Default Model</label>
                        <div className="flex gap-2">
                          <input
                            list="or-models-default"
                            value={settings.openRouterModel}
                            onChange={(e) => handleChange('openRouterModel', e.target.value as any)}
                            placeholder="e.g. openai/gpt-oss-20b:free"
                            className="flex-1 px-3 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet"
                          />
                          <datalist id="or-models-default">
                            {openRouterModelOptions.map(m => (<option key={m} value={m} />))}
                          </datalist>
                          <button type="button" onClick={fetchOpenRouterModels} className="px-3 py-2 rounded-lg bg-dark-elevated/60 border border-dark-border/60 text-text-primary hover:border-accent-violet/50" title="Refresh models">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-dark-bg rounded-lg">
                      <Info className="w-4 h-4 text-accent-violet mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-text-muted">OpenRouter provides access to various AI models. Your API key is stored locally.</p>
                    </div>
                  </div>
                )}

                {/* Dummy AI Settings */}
                {settings.useDummyAI && (
                  <div className="mt-2 space-y-4 p-5 bg-dark-elevated/60 rounded-xl border border-dark-border/60">
                    <div className="flex items-center gap-3">
                      <h3 className="text-text-primary font-medium">Dummy AI Configuration</h3>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-green-500">Ready for testing</span>
                    </div>
                    <div className="p-3 bg-dark-bg rounded-lg">
                      <p className="text-sm text-text-muted">Dummy AI provides simulated responses for testing the UI and chat flow without using API credits.</p>
                      <p className="text-xs text-text-muted mt-2">• Instant responses with realistic streaming<br/>• Supports code blocks, lists, and markdown<br/>• No API key or connection required</p>
                    </div>
                  </div>
                )}

                {/* Ollama Settings */}
                {!settings.useOpenRouter && !settings.useDummyAI && (
                  <div className="mt-2 space-y-4 p-5 bg-dark-elevated/60 rounded-xl border border-dark-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-text-primary font-medium">Ollama Configuration</h3>
                        {connectionStatus && (
                          <div className="flex items-center gap-1">
                            {connectionStatus === 'checking' && (<span className="text-xs text-text-muted">Checking...</span>)}
                            {connectionStatus === 'connected' && (<><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-xs text-green-500">Connected</span></>)}
                            {connectionStatus === 'disconnected' && (<><AlertCircle className="w-4 h-4 text-red-500" /><span className="text-xs text-red-500">Not connected</span></>)}
                          </div>
                        )}
                      </div>
                      <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-accent-violet hover:text-accent-pink transition-colors">
                        Install Ollama
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div>
                      <label className="block text-sm text-text-muted mb-2">Server URL</label>
                      <input type="text" value={settings.ollamaUrl} onChange={(e) => handleChange('ollamaUrl', e.target.value)} placeholder="http://localhost:11434" className="w-full px-4 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-sm text-text-muted mb-2">Model Name</label>
                      <input type="text" value={settings.ollamaModel} onChange={(e) => handleChange('ollamaModel', e.target.value)} placeholder="llama2, mistral, codellama..." className="w-full px-4 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet focus:border-transparent" />
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-dark-bg rounded-lg">
                      <Info className="w-4 h-4 text-accent-violet mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-text-muted">Ollama runs AI models locally on your machine. Ensure the model is pulled and server is running.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-text-primary font-medium">Providers</h3>
                    <p className="text-xs text-text-muted mt-1">Add providers with credentials and models. Enabled ones appear in the header.</p>
                  </div>
                  <button onClick={addPreset} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-elevated/60 border border-dark-border/60 text-text-primary hover:border-accent-violet/50" title="Add provider">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {(settings.modelPresets || []).map(preset => (
                    <div key={preset.id} className="rounded-xl border border-dark-border/60 bg-dark-elevated/60 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border/60 bg-dark-bg/60">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${preset.provider === 'openrouter' ? 'bg-blue-400' : preset.provider === 'ollama' ? 'bg-emerald-400' : 'bg-violet-400'}`} />
                          <input type="text" value={preset.label} onChange={(e) => updatePreset(preset.id, { label: e.target.value })} className="px-2 py-1 rounded-md bg-dark-elevated/60 border border-dark-border/60 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-violet min-w-0 w-48" placeholder="Provider name" />
                          <span className="text-[11px] text-text-muted hidden md:inline">• {preset.provider === 'openrouter' ? 'OpenRouter' : preset.provider === 'ollama' ? 'Ollama' : 'Dummy'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updatePreset(preset.id, { enabled: !preset.enabled })} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dark-border/60 bg-dark-elevated/60 text-[12px] text-text-muted hover:text-text-primary" title={preset.enabled ? 'Disable preset' : 'Enable preset'}>
                            {preset.enabled ? <ToggleRight className="w-4 h-4 text-emerald-300" /> : <ToggleLeft className="w-4 h-4 text-text-muted" />}
                            {preset.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <button onClick={() => removePreset(preset.id)} className="p-1.5 rounded-md hover:bg-red-500/10 border border-transparent hover:border-red-500/30 text-red-300" title="Remove preset">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Provider</label>
                          <div className="inline-flex rounded-lg border border-dark-border/60 bg-dark-bg p-0.5">
                            <button type="button" onClick={() => updatePreset(preset.id, { provider: 'openrouter' })} className={`px-3 py-1.5 rounded-md text-sm ${preset.provider === 'openrouter' ? 'bg-dark-elevated/60 text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>OpenRouter</button>
                            <button type="button" onClick={() => updatePreset(preset.id, { provider: 'ollama' })} className={`px-3 py-1.5 rounded-md text-sm ${preset.provider === 'ollama' ? 'bg-dark-elevated/60 text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>Ollama</button>
                            <button type="button" onClick={() => updatePreset(preset.id, { provider: 'dummy' })} className={`px-3 py-1.5 rounded-md text-sm ${preset.provider === 'dummy' ? 'bg-dark-elevated/60 text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>Dummy</button>
                          </div>
                        </div>
                        {preset.provider === 'openrouter' ? (
                          <div className="md:col-span-2">
                            <label className="block text-xs text-text-muted mb-1">Model ID</label>
                            <input list={`or-models-${preset.id}`} value={preset.model || ''} onChange={(e) => updatePreset(preset.id, { model: e.target.value })} placeholder="e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet" className="w-full px-3 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-violet" />
                            <datalist id={`or-models-${preset.id}`}>
                              {openRouterModelOptions.map(m => (<option key={m} value={m} />))}
                            </datalist>
                            <div className="mt-3">
                              <label className="block text-xs text-text-muted mb-1">API Key (optional)</label>
                              <div className="relative">
                                <input type={showApiKey ? 'text' : 'password'} value={preset.apiKey || ''} onChange={(e) => updatePreset(preset.id, { apiKey: e.target.value })} placeholder="sk-or-v1-..." className="w-full px-3 py-2 pr-20 bg-dark-bg border border-dark-border/60 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-violet" />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                  <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="p-1.5 rounded-md hover:bg-dark-elevated">{showApiKey ? <EyeOff className="w-4 h-4 text-text-muted" /> : <Eye className="w-4 h-4 text-text-muted" />}</button>
                                  <button type="button" onClick={() => navigator.clipboard?.writeText(preset.apiKey || '')} className="p-1.5 rounded-md hover:bg-dark-elevated"><Copy className="w-4 h-4 text-text-muted" /></button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : preset.provider === 'ollama' ? (
                          <>
                            <div>
                              <label className="block text-xs text-text-muted mb-1">Server URL</label>
                              <input type="text" value={preset.serverUrl || settings.ollamaUrl} onChange={(e) => updatePreset(preset.id, { serverUrl: e.target.value })} placeholder="http://localhost:11434" className="w-full px-3 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-violet" />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs text-text-muted mb-1">Model</label>
                              <input type="text" value={preset.model || settings.ollamaModel} onChange={(e) => updatePreset(preset.id, { model: e.target.value })} placeholder="llama2, mistral, codellama..." className="w-full px-3 py-2 bg-dark-bg border border-dark-border/60 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-violet" />
                            </div>
                          </>
                        ) : (
                          <div className="md:col-span-2 text-xs text-text-muted self-center">No configuration required for Dummy.</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {!(settings.modelPresets || []).length && (<div className="text-xs text-text-muted">No presets yet. Click Add to create your first preset.</div>)}
              </div>
            )
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-dark-surface/95 border-t border-dark-border/60 px-6 py-4 flex items-center justify-end gap-3">
            <button onClick={handleCancel} className="px-4 py-2 text-text-muted hover:text-text-primary transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!hasChanges} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${hasChanges ? 'bg-gradient-to-r from-accent-violet to-accent-pink text-white hover:from-accent-violet/90 hover:to-accent-pink/90' : 'bg-dark-elevated/60 text-text-muted cursor-not-allowed'}`}>
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Settings(props: SettingsProps) {
  if (!props.isOpen) return null
  return <SettingsInner {...props} />
}
