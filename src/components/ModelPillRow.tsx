import type { Target } from '../types/chat'

interface ModelPillRowProps {
  selectedTargets: Target[]
  onToggleTarget: (target: Target) => void
  onOpenPicker: () => void
}

const MODEL_DOT_COLORS: Record<string, string> = {
  gemini: 'bg-sky-400',
  openrouter: 'bg-blue-400',
  ollama: 'bg-emerald-400',
}

export default function ModelPillRow({ selectedTargets, onToggleTarget, onOpenPicker }: ModelPillRowProps) {
  return (
    <div
      className="flex items-center gap-2 px-1 py-1.5 overflow-x-auto"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
    >
      {selectedTargets.map((target) => (
        <button
          key={target.key}
          onClick={() => {
            if (selectedTargets.length > 1) onToggleTarget(target)
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-violet/15 border border-accent-violet/30 text-[12px] font-medium text-text-primary whitespace-nowrap flex-shrink-0 active:opacity-70 transition-opacity"
        >
          {selectedTargets.length > 1 && (
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${MODEL_DOT_COLORS[target.provider] ?? 'bg-white/40'}`} />
          )}
          {target.label}
          {selectedTargets.length > 1 && (
            <span className="text-text-muted ml-0.5 text-[10px]">✕</span>
          )}
        </button>
      ))}

      {selectedTargets.length < 3 && (
        <button
          onClick={onOpenPicker}
          className="flex items-center gap-1 px-3 py-1 rounded-full border border-dark-border/60 text-[12px] text-text-muted whitespace-nowrap flex-shrink-0 active:opacity-70 transition-opacity"
        >
          <span className="text-[14px] leading-none">+</span>
          <span>Add model</span>
        </button>
      )}
    </div>
  )
}
