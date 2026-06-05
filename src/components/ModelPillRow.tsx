import { ChevronDown } from 'lucide-react'
import type { Target } from '../types/chat'

interface ModelPillRowProps {
  selectedTargets: Target[]
  onOpenPicker: () => void
}

const MODEL_DOT_COLORS: Record<string, string> = {
  gemini: 'bg-sky-400',
  openrouter: 'bg-blue-400',
  ollama: 'bg-emerald-400',
}

/**
 * Mobile model selector pill. Single-model: shows the active model and opens the
 * picker sheet to switch.
 */
export default function ModelPillRow({ selectedTargets, onOpenPicker }: ModelPillRowProps) {
  const active = selectedTargets[0]

  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <button
        onClick={onOpenPicker}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-violet/15 border border-accent-violet/30 text-[12px] font-medium text-text-primary whitespace-nowrap flex-shrink-0 active:opacity-70 transition-opacity"
      >
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${MODEL_DOT_COLORS[active?.provider] ?? 'bg-white/40'}`} />
        {active?.label ?? 'Model'}
        <ChevronDown className="w-3 h-3 text-text-muted ml-0.5" />
      </button>
    </div>
  )
}
