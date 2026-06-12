/**
 * customLenses — user-defined lenses for the Drift panel.
 *
 * The four signature lenses (Simplify / Deep dive / Connect / Second opinion)
 * plus the Evidence built-in live in TEMPLATE_SYSTEM_PROMPTS.
 * This module adds USER-defined lenses on top: a name, an accent color, and a
 * system prompt, persisted to localStorage. `resolveLensPrompt()` is the single
 * place that maps any lens key — built-in or custom — to its system prompt, so
 * the message-stream path doesn't need to know which kind it is.
 */

import { TEMPLATE_SYSTEM_PROMPTS } from './driftPanel'

export interface CustomLens {
  /** Stable id, also used as the lens key in driftInfos.templateType space. */
  id: string
  name: string
  /** Hex accent color, e.g. "#a855f7". */
  color: string
  systemPrompt: string
}

const STORAGE_KEY = 'drift_custom_lenses'

/** Built-in lens keys, in display order. The first four are the signature set. */
export const BUILTIN_LENS_KEYS = ['simplify', 'research', 'connect', 'challenge', 'evidence', 'example'] as const

export const BUILTIN_LENS_META: Record<string, { label: string; color: string }> = {
  simplify: { label: 'Simplify', color: '#f59e0b' },
  research: { label: 'Deep dive', color: '#3b82f6' },
  connect: { label: 'Connect', color: '#06b6d4' },
  challenge: { label: 'Second opinion', color: '#f43f5e' },
  evidence: { label: 'Evidence', color: '#8b5cf6' },
  example: { label: 'Example', color: '#10b981' },
}

export const customLensStore = {
  getAll(): CustomLens[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isValidLens) : []
    } catch (err) {
      console.error('[customLenses] load failed:', err)
      return []
    }
  },

  get(id: string): CustomLens | undefined {
    return this.getAll().find((l) => l.id === id)
  },

  /** Insert or update a lens. Generates an id from the name when absent. */
  save(lens: Omit<CustomLens, 'id'> & { id?: string }): CustomLens {
    const all = this.getAll()
    const id = lens.id || slugId(lens.name, all)
    const next: CustomLens = { id, name: lens.name, color: lens.color, systemPrompt: lens.systemPrompt }
    const idx = all.findIndex((l) => l.id === id)
    if (idx >= 0) all[idx] = next
    else all.push(next)
    persist(all)
    return next
  },

  delete(id: string): void {
    persist(this.getAll().filter((l) => l.id !== id))
  },
}

/** Map any lens key to its system prompt. Custom lenses win over built-ins. */
export function resolveLensPrompt(lensKey: string | undefined): string | undefined {
  if (!lensKey) return undefined
  const custom = customLensStore.get(lensKey)
  if (custom) return custom.systemPrompt
  return TEMPLATE_SYSTEM_PROMPTS[lensKey]
}

/** Display label + color for any lens key (built-in or custom). */
export function lensMeta(lensKey: string): { label: string; color: string } {
  const custom = customLensStore.get(lensKey)
  if (custom) return { label: custom.name, color: custom.color }
  return BUILTIN_LENS_META[lensKey] ?? { label: 'Drift', color: '#a855f7' }
}

function isValidLens(l: unknown): l is CustomLens {
  return (
    !!l &&
    typeof (l as CustomLens).id === 'string' &&
    typeof (l as CustomLens).name === 'string' &&
    typeof (l as CustomLens).color === 'string' &&
    typeof (l as CustomLens).systemPrompt === 'string'
  )
}

function slugId(name: string, existing: CustomLens[]): string {
  const base = 'lens-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom')
  // Never collide with a built-in key or an existing custom id.
  const taken = new Set([...BUILTIN_LENS_KEYS, ...existing.map((l) => l.id)])
  if (!taken.has(base as never)) return base
  let n = 2
  while (taken.has(`${base}-${n}` as never)) n++
  return `${base}-${n}`
}

function persist(lenses: CustomLens[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lenses))
  } catch (err) {
    console.error('[customLenses] save failed:', err)
  }
}
