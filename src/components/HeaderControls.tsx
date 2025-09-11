import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
type Provider = 'dummy' | 'openrouter' | 'ollama'
type Target = { provider: Provider, key: string, label: string }

interface Props {
  currentUser: string | null
  aiSettings: any
  handleAISettingsChange: (s: any) => void
  setApiConnected: (v: boolean) => void
  setIsConnecting: (v: boolean) => void
  selectedTargets: Target[]
  setSelectedTargets: (m: Target[]) => void
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
    selectedTargets,
    setSelectedTargets,
    isConnecting,
    apiConnected
  } = props

  const isBroadcast = (selectedTargets?.length || 0) > 1
  const summaryLabel = isBroadcast ? `Broadcast · ${selectedTargets.length}` : (selectedTargets[0]?.label || 'Model')

  const toggleTarget = (t: Target) => {
    const has = selectedTargets.some(x => x.key === t.key)
    const next = has ? selectedTargets.filter(x => x.key !== t.key) : [...selectedTargets, t]
    // Ensure at least one
    setSelectedTargets(next.length ? next : [{ provider: 'dummy', key: 'dummy-basic', label: 'Dummy A' }])
  }

  const items: Target[] = [
    { provider: 'dummy', key: 'dummy-basic', label: 'Dummy A' },
    { provider: 'dummy', key: 'dummy-pro', label: 'Dummy Pro' },
    { provider: 'openrouter', key: 'openrouter', label: 'OpenRouter' },
    { provider: 'ollama', key: 'ollama', label: 'Ollama' }
  ]

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuOpen) return
      const el = menuRef.current
      if (el && !el.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    <div className="flex items-center gap-3">
      {/* Models summary + picker */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="px-3 py-1.5 rounded-full bg-dark-elevated/60 border border-dark-border/40 hover:bg-dark-elevated hover:border-accent-violet/30 transition-all duration-100 text-xs font-medium text-text-primary cursor-pointer flex items-center gap-1"
          title="Choose models"
        >
          <Sparkles className={isBroadcast ? 'w-3.5 h-3.5 text-accent-pink' : 'w-3.5 h-3.5 text-accent-violet'} />
          {summaryLabel}
          <ChevronDown className={`w-3.5 h-3.5 text-text-muted ${menuOpen ? 'rotate-180' : ''}`} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-72 bg-dark-surface/95 backdrop-blur-sm border border-dark-border/60 rounded-lg shadow-xl overflow-hidden z-50">
            <div className="px-3 py-2 text-[11px] text-text-muted">Select one or more models</div>
            <div className="h-px bg-dark-border/60" />
            <div className="py-1">
              {items.map(t => {
                const active = selectedTargets.some(x => x.key === t.key)
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleTarget(t)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-dark-elevated ${active ? 'text-accent-violet' : 'text-text-primary'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${t.provider === 'dummy' ? 'bg-accent-violet' : t.provider === 'openrouter' ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                      {t.label}{t.provider === 'openrouter' ? ` • ${aiSettings.openRouterModel || ''}` : ''}{t.provider === 'ollama' ? ` • ${aiSettings.ollamaModel || ''}` : ''}
                    </span>
                    <span className={`w-4 h-4 rounded border ${active ? 'bg-accent-violet/30 border-accent-violet/60' : 'border-dark-border/60'}`} />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {/* Connection chip */}
      <div className={`px-3 py-1.5 rounded-full text-[11px] border ${
        isConnecting ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : (apiConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300')
      }`}>
        {isConnecting ? 'Connecting' : apiConnected ? 'Connected' : 'Offline'}
      </div>
    </div>
  )
}
