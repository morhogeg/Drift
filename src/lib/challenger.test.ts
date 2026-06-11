import { describe, it, expect } from 'vitest'
import { challengerOptions, resolveChallengerTarget, resolveModelCall, type ModelCallSettings } from './challenger'
import type { ModelPreset } from '@/components/Settings'
import type { Target } from '@/types/chat'

const preset = (p: Partial<ModelPreset> & { id: string; provider: ModelPreset['provider'] }): ModelPreset => ({
  label: p.id, model: 'm', enabled: true, ...p,
})

const PRESETS: ModelPreset[] = [
  preset({ id: 'gemini-flash-lite', provider: 'gemini', label: 'Gemini Flash Lite', model: 'gemini-3.1-flash-lite' }),
  preset({ id: 'claude', provider: 'openrouter', label: 'Claude Haiku', model: 'anthropic/claude-haiku-4-5' }),
  preset({ id: 'grok', provider: 'openrouter', label: 'Grok', model: 'x-ai/grok', enabled: false }),
  preset({ id: 'local', provider: 'ollama', label: 'Llama', model: 'llama3', serverUrl: 'http://localhost:11434' }),
]

describe('challengerOptions', () => {
  it('offers enabled presets from any provider except the main model, and is empty when only the main exists', () => {
    expect(challengerOptions(PRESETS, 'gemini-flash-lite').map(o => o.key)).toEqual(['claude', 'local']) // grok disabled, gemini is main
    expect(challengerOptions([PRESETS[0]], 'gemini-flash-lite')).toEqual([]) // → caller shows "Add a model"
  })
})

describe('resolveChallengerTarget', () => {
  it('returns a valid saved challenger, else null (→ re-open picker) when unset/equal-to-main/gone/disabled', () => {
    const saved: Target = { provider: 'openrouter', key: 'claude', label: 'Claude Haiku' }
    expect(resolveChallengerTarget(saved, PRESETS, 'gemini-flash-lite')).toMatchObject({ key: 'claude' })
    expect(resolveChallengerTarget(null, PRESETS, 'gemini-flash-lite')).toBeNull()
    expect(resolveChallengerTarget({ provider: 'gemini', key: 'gemini-flash-lite', label: 'x' }, PRESETS, 'gemini-flash-lite')).toBeNull() // equals main
    expect(resolveChallengerTarget({ provider: 'openrouter', key: 'grok', label: 'Grok' }, PRESETS, 'gemini-flash-lite')).toBeNull() // disabled
    expect(resolveChallengerTarget({ provider: 'openrouter', key: 'deleted', label: 'X' }, PRESETS, 'gemini-flash-lite')).toBeNull() // gone
  })
})

describe('resolveModelCall', () => {
  const settings: ModelCallSettings = {
    modelPresets: PRESETS,
    openRouterApiKey: 'or-key', openRouterModel: 'openai/gpt-oss-20b:free',
    geminiApiKey: 'gem-key', geminiModel: 'gemini-3.1-flash-lite',
    ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama2',
  }

  it('routes OpenRouter to the preset model (Claude), not the hard-coded OSS/QWEN3', () => {
    const call = resolveModelCall({ provider: 'openrouter', key: 'claude', label: 'Claude Haiku' }, settings)
    expect(call).toEqual({ provider: 'openrouter', model: 'anthropic/claude-haiku-4-5', apiKey: 'or-key' })
  })

  it('resolves gemini and ollama with per-preset values and settings fallback', () => {
    const gem = resolveModelCall({ provider: 'gemini', key: 'gemini-flash-lite', label: 'g' }, settings)
    expect(gem).toEqual({ provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'gem-key' })
    const oll = resolveModelCall({ provider: 'ollama', key: 'local', label: 'Llama' }, settings)
    expect(oll).toEqual({ provider: 'ollama', model: 'llama3', serverUrl: 'http://localhost:11434' })
    // unknown preset key → fall back to settings-wide model/key
    const fallback = resolveModelCall({ provider: 'gemini', key: 'missing', label: 'x' }, settings)
    expect(fallback).toEqual({ provider: 'gemini', model: 'gemini-3.1-flash-lite', apiKey: 'gem-key' })
  })
})
