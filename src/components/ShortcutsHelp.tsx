import { useEffect } from 'react'
import { X, GitBranch, Telescope, Bookmark, Sparkles, Network } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Keyboard & Tips overlay — the one place a first-time user can learn the hidden
 * shortcuts AND what the icon-only controls actually do (Snippets, Map) plus the
 * signature drift gesture and lenses. Opened from the header "?" and the `?` key.
 */
interface Props {
  isOpen: boolean
  onClose: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'
const ALT = isMac ? '⌥' : 'Alt'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[24px] h-[24px] px-1.5 rounded-md
                 text-[12px] font-semibold text-text-secondary
                 bg-dark-elevated border border-dark-border shadow-[0_1px_0_0_rgba(0,0,0,0.12)]"
    >
      {children}
    </kbd>
  )
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-[13.5px] text-text-secondary">{label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
      </span>
    </div>
  )
}

function Tip({ Icon, tint, title, children }: { Icon: LucideIcon; tint: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5"
        style={{ background: `${tint}1f`, border: `1px solid ${tint}3a` }}
      >
        <Icon className="w-4 h-4" style={{ color: tint }} />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-text-primary leading-snug">{title}</p>
        <p className="text-[12.5px] text-text-muted leading-snug mt-0.5">{children}</p>
      </div>
    </div>
  )
}

export default function ShortcutsHelp({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts and tips"
    >
      <div
        className="w-full max-w-[460px] max-h-[85vh] overflow-y-auto rounded-2xl bg-dark-surface border border-dark-border shadow-2xl
                   animate-[fadeIn_0.18s_cubic-bezier(0.16,1,0.3,1)] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3 border-b border-dark-border sticky top-0 bg-dark-surface z-10">
          <h2 className="text-[15px] font-semibold text-text-primary">Keyboard &amp; Tips</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-text-muted hover:text-text-primary hover:bg-dark-elevated transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3">
          {/* Shortcuts */}
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-text-muted/70 mb-1 mt-1">Shortcuts</p>
          <div className="divide-y divide-dark-border">
            <ShortcutRow label="Search chats & drifts" keys={[MOD, 'K']} />
            <ShortcutRow label="New chat" keys={[MOD, ALT, 'N']} />
            <ShortcutRow label="Open the Drift Map" keys={[MOD, ALT, 'G']} />
            <ShortcutRow label="This help" keys={['?']} />
          </div>

          {/* What the controls do */}
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-text-muted/70 mb-1 mt-5">How Drift works</p>
          <div className="divide-y divide-dark-border">
            <Tip Icon={GitBranch} tint="#a855f7" title="Drift — the core move">
              Highlight any phrase in a reply, then tap <span className="text-accent-violet font-medium">Drift</span> to open a focused side-thread without losing your place.
            </Tip>
            <Tip Icon={Telescope} tint="#38bdf8" title="Lenses">
              Re-view the same term as <b className="font-medium text-text-secondary">Simplify</b>, <b className="font-medium text-text-secondary">Deep dive</b>, <b className="font-medium text-text-secondary">Connect</b>, or <b className="font-medium text-text-secondary">Stress test</b> — each keeps its own thread.
            </Tip>
            <Tip Icon={Bookmark} tint="#06b6d4" title="Snippets">
              Save a reply or a selection to your gallery (the bookmark icon) to keep the moments worth returning to.
            </Tip>
            <Tip Icon={Network} tint="#c084fc" title="Drift Map">
              Once you&apos;ve branched, see every drift as a living, navigable map of your exploration.
            </Tip>
            <Tip Icon={Sparkles} tint="#f0abfc" title="Synthesize">
              Weave a thread&apos;s drifts back into one woven summary on the main chat.
            </Tip>
          </div>
        </div>
      </div>
    </div>
  )
}
