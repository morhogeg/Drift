import { ChevronDown, Sparkles } from 'lucide-react'

type Mode = 'dummy-basic' | 'dummy-pro' | 'broadcast'

interface Props {
  chatModelMode: Mode
  setChatModelMode: (m: Mode) => void
  modelMenuOpen: boolean
  setModelMenuOpen: (open: boolean) => void
}

export default function DummyModelSelector({ chatModelMode, setChatModelMode, modelMenuOpen, setModelMenuOpen }: Props) {
  const label = chatModelMode === 'broadcast' ? 'Broadcast' : chatModelMode === 'dummy-pro' ? 'Dummy Pro' : 'Dummy A'
  const labelTone = chatModelMode === 'broadcast' ? 'text-accent-pink' : 'text-accent-violet'
  return (
    <div className="relative">
      <button
        onClick={() => setModelMenuOpen(!modelMenuOpen)}
        className={`px-2.5 py-1 rounded-full border text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-colors bg-dark-elevated/60 border-dark-border/40 hover:bg-dark-elevated hover:border-accent-violet/40`}
        title="Choose Dummy model or Broadcast"
      >
        <Sparkles className={`w-3.5 h-3.5 ${chatModelMode === 'broadcast' ? 'text-accent-pink' : 'text-accent-violet'}`} />
        <span className={labelTone}>{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
      </button>
      {modelMenuOpen && (
        <div className="absolute right-0 mt-2 w-60 bg-dark-surface/95 backdrop-blur-sm border border-dark-border/60 rounded-lg shadow-xl overflow-hidden z-50">
          <MenuItem
            active={chatModelMode === 'dummy-basic'}
            tone="violet"
            onClick={() => { setChatModelMode('dummy-basic'); setModelMenuOpen(false) }}
            primary="Dummy A"
            secondary="concise, friendly"
          />
          <MenuItem
            active={chatModelMode === 'dummy-pro'}
            tone="violet"
            onClick={() => { setChatModelMode('dummy-pro'); setModelMenuOpen(false) }}
            primary="Dummy Pro"
            secondary="analytical"
          />
          <div className="h-px bg-dark-border/60" />
          <MenuItem
            active={chatModelMode === 'broadcast'}
            tone="pink"
            onClick={() => { setChatModelMode('broadcast'); setModelMenuOpen(false) }}
            primary="Broadcast"
            secondary="Dummy A + Pro"
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({ active, tone, onClick, primary, secondary }: { active: boolean, tone: 'violet' | 'pink', onClick: () => void, primary: string, secondary?: string }) {
  const activeColor = tone === 'pink' ? 'text-accent-pink' : 'text-accent-violet'
  return (
    <button
      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-dark-elevated transition-colors`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className={`w-3.5 h-3.5 ${tone === 'pink' ? 'text-accent-pink' : 'text-accent-violet'}`} />
        <div className="min-w-0">
          <div className={`text-sm ${active ? activeColor : 'text-text-primary'}`}>{primary}</div>
          {secondary && <div className="text-[11px] text-text-muted">{secondary}</div>}
        </div>
      </div>
      {active && (
        <span className={`text-[11px] ${activeColor}`}>Selected</span>
      )}
    </button>
  )
}
