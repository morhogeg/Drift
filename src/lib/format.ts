/**
 * Small, pure text/date formatting helpers shared across the app.
 * No React, no state — safe to import anywhere.
 */

/** Strip serialization artifacts (`[object Object]`) and a trailing <br> from model text. */
export function sanitizeText(text: string): string {
  return text.replace(/,?\[object Object\],?/g, '').replace(/<br\/?>$/gm, '\n')
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
