/**
 * Small, pure text/date formatting helpers shared across the app.
 * No React, no state — safe to import anywhere.
 */

/** Strip serialization artifacts (`[object Object]`) and a trailing <br> from model text. */
export function sanitizeText(text: string): string {
  return text.replace(/,?\[object Object\],?/g, '').replace(/<br\/?>$/gm, '\n')
}

/** Compact relative time: just now / 5m ago / 3h ago / short date. */
export function timeAgo(date: Date | string | number | undefined): string {
  if (!date) return ''
  const t = new Date(date).getTime()
  if (!t) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Relative day label: Today / Yesterday / N days ago / short date. */
export function formatDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
