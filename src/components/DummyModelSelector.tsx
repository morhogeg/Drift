import { ChevronDown, Sparkles } from 'lucide-react'

type Mode = 'dummy-basic' | 'dummy-pro' | 'broadcast'

interface Props {
  chatModelMode: Mode
  setChatModelMode: (m: Mode) => void
  modelMenuOpen: boolean
  setModelMenuOpen: (open: boolean) => void
}

export default function DummyModelSelector({ chatModelMode, setChatModelMode, modelMenuOpen, setModelMenuOpen }: Props) {
  return (
    <div className="relative">
      <button
        onClick={() => setModelMenuOpen(!modelMenuOpen)}
        className="px-3 py-1.5 rounded-full bg-dark-elevated/70 border border-dark-border/40 hover:bg-dark-elevated hover:border-accent-violet/30 transition-all duration-100 text-xs font-medium text-text-primary cursor-pointer flex items-center gap-1"
        title="Choose Dummy model or Broadcast"
      >
        <Sparkles className="w-3.5 h-3.5 text-accent-violet" />
        {chatModelMode === 'broadcast' ? 'Broadcast' : chatModelMode === 'dummy-pro' ? 'Dummy Pro' : 'Dummy A'}
        <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
      </button>
      {modelMenuOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-dark-surface border border-dark-border/60 rounded-lg shadow-xl overflow-hidden z-50">
          <button
            className={`w-full text-left px-3 py-2 text-sm hover:bg-dark-elevated ${chatModelMode === 'dummy-basic' ? 'text-accent-violet' : 'text-text-primary'}`}
            onClick={() => { setChatModelMode('dummy-basic'); setModelMenuOpen(false) }}
          >
            Dummy A (concise, friendly)
          </button>
          <button
            className={`w-full text-left px-3 py-2 text-sm hover:bg-dark-elevated ${chatModelMode === 'dummy-pro' ? 'text-accent-violet' : 'text-text-primary'}`}
            onClick={() => { setChatModelMode('dummy-pro'); setModelMenuOpen(false) }}
          >
            Dummy Pro (analytical)
          </button>
          <div className="h-px bg-dark-border/60" />
          <button
            className={`w-full text-left px-3 py-2 text-sm hover:bg-dark-elevated ${chatModelMode === 'broadcast' ? 'text-accent-pink' : 'text-text-primary'}`}
            onClick={() => { setChatModelMode('broadcast'); setModelMenuOpen(false) }}
          >
            Broadcast: Dummy A + Pro
          </button>
        </div>
      )}
    </div>
  )
}

