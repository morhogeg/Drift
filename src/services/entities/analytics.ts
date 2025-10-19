type EventName =
  | 'context_link_shown'
  | 'context_link_hover'
  | 'preview_opened'
  | 'preview_jump_back'
  | 'preview_jump_forward'
  | 'all_mentions_opened'
  | 'all_mentions_navigate'
  | 'disambiguation_shown'
  | 'wrong_link_reported'

interface EventPayload {
  conversationId?: string
  entityId?: string
  messageId?: string
  count?: number
}

export function track(event: EventName, payload: EventPayload = {}) {
  // Minimal, privacy-safe stub. Replace with real telemetry later.
  try {
    // Guard behind local toggle only
    const enabled = localStorage.getItem('drift_analytics') === 'on'
    if (!enabled) return
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, payload)
  } catch {}
}

