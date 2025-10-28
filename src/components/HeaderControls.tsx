import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Megaphone } from 'lucide-react'
type Provider = 'dummy' | 'openrouter' | 'ollama'
type Target = { provider: Provider, key: string, label: string }

interface Props {
  aiSettings: any
  selectedTargets: Target[]
  setSelectedTargets: (m: Target[]) => void
  isConnecting: boolean
  apiConnected: boolean
}

export default function HeaderControls(props: Props) {
  const { aiSettings, selectedTargets, setSelectedTargets, isConnecting, apiConnected } = props

  const items: Target[] = [
    { provider: 'dummy', key: 'dummy-basic', label: 'Qwen3' },
    { provider: 'openrouter', key: 'openrouter', label: 'OpenAI OSS' },
    { provider: 'ollama', key: 'ollama', label: 'Ollama' }
  ]

  const allowedKeys = new Set(items.map(i => i.key))
  const visibleTargets = (selectedTargets || []).filter(t => allowedKeys.has(t.key))
  const isBroadcast = (visibleTargets.length || 0) > 1
  // Resolve label from current items to avoid stale persisted labels
  const first = visibleTargets[0]
  const resolvedFirstLabel = first ? (items.find(i => i.key === first.key)?.label || first.label) : undefined
  const summaryLabel = isBroadcast ? `Broadcast · ${visibleTargets.length}` : (resolvedFirstLabel || 'Model')

  const toggleTarget = (t: Target) => {
    const has = visibleTargets.some(x => x.key === t.key)
    const next = has ? visibleTargets.filter(x => x.key !== t.key) : [...visibleTargets, t]
    // Ensure at least one
    setSelectedTargets(next.length ? next : [{ provider: 'dummy', key: 'dummy-basic', label: 'Qwen3' }])
  }

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

  // Normalize persisted targets to current labels to avoid showing stale names
  useEffect(() => {
    const map = new Map(items.map(i => [i.key, i]))
    const needsUpdate = visibleTargets.some(t => (map.get(t.key)?.label ?? t.label) !== t.label)
    if (needsUpdate) {
      const normalized = visibleTargets.map(t => map.get(t.key) || t)
      setSelectedTargets(normalized)
    }
    // Only run when selectedTargets or items change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTargets])

  // Classic rendering
  return (
    <div className="flex items-center gap-3">
      {/* Models summary + picker */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="px-3 py-1 rounded-full bg-dark-elevated/60 border border-dark-border/40 hover:bg-dark-elevated hover:border-accent-violet/30 transition-all duration-100 text-xs font-medium text-text-primary cursor-pointer flex items-center gap-1"
          title="Choose models"
        >
          {isBroadcast && <Megaphone className="w-3.5 h-3.5 text-accent-pink" />}
          {!isBroadcast && null}
          <span>{summaryLabel}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-text-muted ${menuOpen ? 'rotate-180' : ''}`} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-dark-surface/95 backdrop-blur-sm border border-dark-border/60 rounded-lg shadow-xl overflow-hidden z-50">
            <div className="py-1">
              {items.map(t => {
                const active = visibleTargets.some(x => x.key === t.key)
                const accent = t.provider === 'dummy' ? 'text-accent-violet' : t.provider === 'openrouter' ? 'text-blue-300' : 'text-emerald-300'
                const dot = t.provider === 'dummy' ? 'bg-accent-violet' : t.provider === 'openrouter' ? 'bg-blue-400' : 'bg-emerald-400'
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleTarget(t)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] hover:bg-dark-elevated/60 transition-colors ${active ? accent : 'text-text-primary'}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
                      <span className="truncate">
                        {t.label}
                        <span className="text-text-muted">{t.provider === 'openrouter' ? ` • ${aiSettings.openRouterModel || ''}` : t.provider === 'ollama' ? ` • ${aiSettings.ollamaModel || ''}` : ''}</span>
                      </span>
                    </span>
                    {active ? (
                      <Check className={`w-3.5 h-3.5 ${accent}`} />
                    ) : (
                      <span className="w-3.5 h-3.5" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {/* Connection chip */}
      <div className={`px-3 py-1 rounded-full text-[11px] border ${
        isConnecting ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : (apiConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300')
      }`}>
        {isConnecting ? 'Connecting' : apiConnected ? 'Connected' : 'Offline'}
      </div>
    </div>
  )
}
