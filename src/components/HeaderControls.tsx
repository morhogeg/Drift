import { ChevronDown, Sparkles } from 'lucide-react'
import type { OpenRouterModel } from '../services/openrouter'
import DummyModelSelector from './DummyModelSelector'

type Mode = 'dummy-basic' | 'dummy-pro' | 'broadcast'

interface Props {
  currentUser: string | null
  aiSettings: any
  handleAISettingsChange: (s: any) => void
  setApiConnected: (v: boolean) => void
  setIsConnecting: (v: boolean) => void
  chatModelMode: Mode
  setChatModelMode: (m: Mode) => void
  modelMenuOpen: boolean
  setModelMenuOpen: (open: boolean) => void
  isConnecting: boolean
  apiConnected: boolean
}

export default function HeaderControls(props: Props) {
  const {
    currentUser,
    aiSettings,
    handleAISettingsChange,
    setApiConnected,
    setIsConnecting,
    chatModelMode,
    setChatModelMode,
    modelMenuOpen,
    setModelMenuOpen,
    isConnecting,
    apiConnected
  } = props

  return (
    <div className="flex items-center gap-3">
      {/* User Display */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-elevated/50 rounded-full border border-dark-border/30">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-xs text-text-secondary">{currentUser}</span>
      </div>
      {/* Unified Model Selector with custom styling */}
      <div className="relative z-50">
        <select
          value={aiSettings.useDummyAI ? 'dummy' : (aiSettings.useOpenRouter ? aiSettings.openRouterModel : 'ollama')}
          onChange={(e) => {
            const value = e.target.value as string | OpenRouterModel
            if (value === 'dummy') {
              handleAISettingsChange({ ...aiSettings, useDummyAI: true, useOpenRouter: false })
              setApiConnected(true)
              setIsConnecting(false)
            } else if (value === 'ollama') {
              setIsConnecting(true)
              handleAISettingsChange({ ...aiSettings, useDummyAI: false, useOpenRouter: false })
            } else {
              setIsConnecting(true)
              handleAISettingsChange({ 
                ...aiSettings, 
                useDummyAI: false,
                useOpenRouter: true, 
                openRouterModel: value as OpenRouterModel 
              })
            }
          }}
          className="relative z-50 appearance-none pl-4 pr-8 py-1.5 rounded-full bg-dark-elevated/70 border border-dark-border/40 hover:bg-dark-elevated hover:border-accent-violet/30 transition-all duration-100 text-xs font-medium text-text-primary cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-violet/40 focus:border-transparent"
          title="Select AI model"
        >
          <optgroup label="OpenRouter (Free)">
            <option value="openai/gpt-oss-20b:free">OSS-20B</option>
          </optgroup>
          <optgroup label="Testing">
            <option value="dummy">Dummy AI</option>
          </optgroup>
          <optgroup label="Local">
            <option value="ollama">Ollama</option>
          </optgroup>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
      </div>
      {aiSettings.useDummyAI && (
        <DummyModelSelector
          chatModelMode={chatModelMode}
          setChatModelMode={setChatModelMode}
          modelMenuOpen={modelMenuOpen}
          setModelMenuOpen={setModelMenuOpen}
        />
      )}
      {/* Connection Status Badge */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm transition-all duration-150 ${
        isConnecting
          ? 'bg-amber-500/10 border border-amber-500/30'
          : apiConnected 
            ? 'bg-emerald-500/10 border border-emerald-500/30' 
            : 'bg-red-500/10 border border-red-500/30'
      }`}>
        <div className={`w-1.5 h-1.5 rounded-full ${
          isConnecting
            ? 'bg-amber-500 animate-pulse'
            : apiConnected 
              ? 'bg-emerald-500' 
              : 'bg-red-500'
        }`} />
        <span className={`text-xs font-medium ${
          isConnecting
            ? 'text-amber-400'
            : apiConnected 
              ? 'text-emerald-400' 
              : 'text-red-400'
        }`}>
          {isConnecting ? 'Connecting...' : apiConnected ? 'Connected' : 'Offline'}
        </span>
      </div>
    </div>
  )
}

