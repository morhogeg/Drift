import { useState, useEffect } from 'react'
import { X, Save, Eye, EyeOff, Info, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react'
import type { OpenRouterModel } from '../services/openrouter'
import { OPENROUTER_MODELS, checkOpenRouterConnection } from '../services/openrouter'
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
}

export default function Settings({ isOpen, onClose, onSave, currentSettings }: SettingsProps) {
  const [settings, setSettings] = useState<AISettings>(currentSettings)
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | null>(null)

  useEffect(() => {
    setSettings(currentSettings)
    setHasChanges(false)
  }, [currentSettings])

  useEffect(() => {
    if (isOpen) {
      // Only check connection when settings modal opens, not on every change
      checkConnection()
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111111] border border-[#333333] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-[#333333]">
          <h2 className="text-xl font-semibold text-white">AI Settings</h2>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-[#222222] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#9ca3af]" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* AI Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-3">
                AI Provider
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    handleChange('useOpenRouter', true)
                    handleChange('useDummyAI', false)
                  }}
                  className={`p-4 rounded-lg border transition-all ${
                    settings.useOpenRouter && !settings.useDummyAI
                      ? 'bg-gradient-to-r from-violet-600/20 to-pink-600/20 border-violet-500'
                      : 'bg-[#1a1a1a] border-[#333333] hover:border-[#444444]'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <span className="text-white font-medium">OpenRouter</span>
                    <span className="text-xs text-[#6b7280]">Cloud models</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    handleChange('useOpenRouter', false)
                    handleChange('useDummyAI', false)
                  }}
                  className={`p-4 rounded-lg border transition-all ${
                    !settings.useOpenRouter && !settings.useDummyAI
                      ? 'bg-gradient-to-r from-violet-600/20 to-pink-600/20 border-violet-500'
                      : 'bg-[#1a1a1a] border-[#333333] hover:border-[#444444]'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <span className="text-white font-medium">Ollama</span>
                    <span className="text-xs text-[#6b7280]">Local models</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    handleChange('useDummyAI', true)
                    handleChange('useOpenRouter', false)
                  }}
                  className={`p-4 rounded-lg border transition-all ${
                    settings.useDummyAI
                      ? 'bg-gradient-to-r from-violet-600/20 to-pink-600/20 border-violet-500'
                      : 'bg-[#1a1a1a] border-[#333333] hover:border-[#444444]'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <span className="text-white font-medium">Dummy AI</span>
                    <span className="text-xs text-[#6b7280]">For testing</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Broadcast mode removed: handled in main chat selector */}

            {/* OpenRouter Settings */}
            {settings.useOpenRouter && (
              <div className="space-y-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-white font-medium">OpenRouter Configuration</h3>
                    {connectionStatus && (
                      <div className="flex items-center gap-1">
                        {connectionStatus === 'checking' && (
                          <span className="text-xs text-[#9ca3af]">Checking...</span>
                        )}
                        {connectionStatus === 'connected' && (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-xs text-green-500">Connected</span>
                          </>
                        )}
                        {connectionStatus === 'disconnected' && (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            <span className="text-xs text-red-500">Not connected</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Get API Key
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-sm text-[#9ca3af] mb-2">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={settings.openRouterApiKey}
                      onChange={(e) => handleChange('openRouterApiKey', e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="w-full px-4 py-2 pr-10 bg-[#0a0a0a] border border-[#333333] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[#222222] rounded transition-colors"
                    >
                      {showApiKey ? (
                        <EyeOff className="w-4 h-4 text-[#6b7280]" />
                      ) : (
                        <Eye className="w-4 h-4 text-[#6b7280]" />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={checkConnection}
                    className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Test Connection
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-[#9ca3af] mb-2">
                    Model
                  </label>
                  <div className="w-full px-4 py-2 bg-[#0a0a0a] border border-[#333333] rounded-lg text-white">
                    OpenAI OSS-20B (Free)
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 bg-[#0a0a0a] rounded-lg">
                  <Info className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#9ca3af]">
                    OpenRouter provides access to various AI models. Free tier models have usage limits.
                    Your API key is stored locally in your browser.
                  </p>
                </div>
              </div>
            )}

            {/* Dummy AI Settings */}
            {settings.useDummyAI && (
              <div className="space-y-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-medium">Dummy AI Configuration</h3>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-500">Ready for testing</span>
                </div>
                <div className="p-3 bg-[#0a0a0a] rounded-lg">
                  <p className="text-sm text-[#9ca3af]">
                    Dummy AI provides simulated responses for testing the UI and chat flow without using API credits.
                  </p>
                  <p className="text-xs text-[#6b7280] mt-2">
                    • Instant responses with realistic streaming
                    <br />
                    • Supports code blocks, lists, and markdown
                    <br />
                    • No API key or connection required
                  </p>
                </div>
              </div>
            )}

            {/* Ollama Settings */}
            {!settings.useOpenRouter && !settings.useDummyAI && (
              <div className="space-y-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#333333]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-white font-medium">Ollama Configuration</h3>
                    {connectionStatus && (
                      <div className="flex items-center gap-1">
                        {connectionStatus === 'checking' && (
                          <span className="text-xs text-[#9ca3af]">Checking...</span>
                        )}
                        {connectionStatus === 'connected' && (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-xs text-green-500">Connected</span>
                          </>
                        )}
                        {connectionStatus === 'disconnected' && (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            <span className="text-xs text-red-500">Not connected</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <a
                    href="https://ollama.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Install Ollama
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-sm text-[#9ca3af] mb-2">
                    Server URL
                  </label>
                  <input
                    type="text"
                    value={settings.ollamaUrl}
                    onChange={(e) => handleChange('ollamaUrl', e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full px-4 py-2 bg-[#0a0a0a] border border-[#333333] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#9ca3af] mb-2">
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={settings.ollamaModel}
                    onChange={(e) => handleChange('ollamaModel', e.target.value)}
                    placeholder="llama2, mistral, codellama..."
                    className="w-full px-4 py-2 bg-[#0a0a0a] border border-[#333333] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-start gap-2 p-3 bg-[#0a0a0a] rounded-lg">
                  <Info className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[#9ca3af]">
                    Ollama runs AI models locally on your machine. Make sure Ollama is running and the model is downloaded.
                    Default URL is http://localhost:11434
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-[#333333]">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-[#9ca3af] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              hasChanges
                ? 'bg-gradient-to-r from-violet-600 to-pink-600 text-white hover:from-violet-500 hover:to-pink-500'
                : 'bg-[#333333] text-[#6b7280] cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
