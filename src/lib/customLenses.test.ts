import { describe, it, expect, beforeEach, vi } from 'vitest'

// vitest runs in node here (no jsdom) — provide a minimal localStorage.
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
})

import { customLensStore, resolveLensPrompt, lensMeta } from './customLenses'
import { TEMPLATE_SYSTEM_PROMPTS } from './driftPanel'

beforeEach(() => localStorage.clear())

describe('customLenses', () => {
  it('saves, lists, and generates a collision-safe id', () => {
    const a = customLensStore.save({ name: 'ELI5 Pirate', color: '#ff0', systemPrompt: 'arr' })
    expect(a.id).toBe('lens-eli5-pirate')
    expect(customLensStore.getAll()).toHaveLength(1)

    // Same name → distinct id, not an overwrite.
    const b = customLensStore.save({ name: 'ELI5 Pirate', color: '#0ff', systemPrompt: 'yarr' })
    expect(b.id).toBe('lens-eli5-pirate-2')
    expect(customLensStore.getAll()).toHaveLength(2)
  })

  it('never collides with a built-in key', () => {
    const l = customLensStore.save({ name: 'Simplify', color: '#000', systemPrompt: 'x' })
    expect(l.id).not.toBe('simplify')
  })

  it('updates in place when an id is provided, and deletes', () => {
    const a = customLensStore.save({ name: 'Test', color: '#111', systemPrompt: 'one' })
    customLensStore.save({ id: a.id, name: 'Test', color: '#222', systemPrompt: 'two' })
    expect(customLensStore.getAll()).toHaveLength(1)
    expect(customLensStore.get(a.id)!.systemPrompt).toBe('two')
    customLensStore.delete(a.id)
    expect(customLensStore.getAll()).toHaveLength(0)
  })

  it('resolveLensPrompt: custom wins, built-ins resolve, unknown is undefined', () => {
    expect(resolveLensPrompt('simplify')).toBe(TEMPLATE_SYSTEM_PROMPTS.simplify)
    expect(resolveLensPrompt('steelman')).toBe(TEMPLATE_SYSTEM_PROMPTS.steelman)
    expect(resolveLensPrompt('evidence')).toBe(TEMPLATE_SYSTEM_PROMPTS.evidence)
    expect(resolveLensPrompt(undefined)).toBeUndefined()
    expect(resolveLensPrompt('nope')).toBeUndefined()

    const c = customLensStore.save({ name: 'Mine', color: '#abc', systemPrompt: 'custom prompt' })
    expect(resolveLensPrompt(c.id)).toBe('custom prompt')
  })

  it('lensMeta returns built-in, custom, and drift fallback', () => {
    expect(lensMeta('challenge')).toEqual({ label: 'Challenge', color: '#f43f5e' })
    const c = customLensStore.save({ name: 'Skeptic', color: '#abcdef', systemPrompt: 'p' })
    expect(lensMeta(c.id)).toEqual({ label: 'Skeptic', color: '#abcdef' })
    expect(lensMeta('whatever').label).toBe('Drift')
  })

  it('ships Steelman and Evidence as built-in prompts', () => {
    expect(TEMPLATE_SYSTEM_PROMPTS.steelman).toMatch(/strongest/i)
    expect(TEMPLATE_SYSTEM_PROMPTS.evidence).toMatch(/evidence/i)
  })
})
