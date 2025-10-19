import { useEffect, useState } from 'react'
import type { EntityID, Mention } from '../../types/entities'
import { getAllMentions, getCanonicalEntity } from '../../services/entities/indexer'
import { getNavigationState } from '../../services/entities/navigation'

type Props = { entityId: EntityID; onClose: () => void }

export default function AllMentionsPanel({ entityId, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Mention[]>([])
  const ent = getCanonicalEntity(entityId)
  const nav = getNavigationState(entityId)

  useEffect(() => {
    setItems(getAllMentions(entityId))
  }, [entityId])

  const filtered = items.filter(m => !query || m.snippet.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[380px] bg-dark-elevated border-l border-dark-border/60 z-40 shadow-2xl flex flex-col">
      <div className="p-3 border-b border-dark-border/50">
        <div className="font-semibold text-text-primary">{ent?.name || 'Entity'} — All Mentions</div>
        <input
          className="mt-2 w-full px-2 py-1 rounded bg-dark-bg border border-dark-border/60 text-text-secondary focus:outline-none focus:border-accent-violet/50"
          placeholder="Search mentions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.map((m) => (
          <button
            key={`${m.entityId}-${m.messageId}-${m.start}`}
            className="block w-full text-left px-3 py-2 border-b border-dark-border/30 hover:bg-dark-bg"
            onClick={() => {
              // Route via mentions-navigate to manage nav stacks
              window.dispatchEvent(new CustomEvent('drift:mentions-navigate', { detail: { entityId, to: m.messageId } }))
              onClose()
            }}
          >
            <div className="text-[11px] text-text-muted">{m.createdAt} · {m.messageId}</div>
            <div className="text-[13px] text-text-secondary line-clamp-2">{m.snippet}</div>
          </button>
        ))}
      </div>
      <div className="p-3 border-t border-dark-border/50 flex gap-2">
        {nav.originMessageId && (
          <button
            className="px-2 py-1 rounded bg-accent-violet/15 border border-accent-violet/30 text-accent-violet hover:bg-accent-violet/25"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('drift:navigate-to-message', { detail: { to: nav.originMessageId } }))
              onClose()
            }}
          >
            Back to origin
          </button>
        )}
        <button className="ml-auto px-2 py-1 rounded bg-dark-elevated border border-dark-border/60 text-text-secondary hover:border-text-secondary/40" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
