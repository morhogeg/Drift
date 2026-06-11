/**
 * challenger — pure logic for Drift's cross-model Challenge.
 *
 * Challenge no longer asks the main model to argue with itself. Instead the user
 * picks a *challenger model* (first time they use Challenge, editable in Settings),
 * and Challenge responses stream from that independent model. This module owns the
 * three decisions that are easy to get wrong, kept pure so they're unit-testable:
 *   • which models the picker offers (challengerOptions)
 *   • whether a saved challenger is still usable or needs re-picking (resolveChallengerTarget)
 *   • how a chosen Target maps to a concrete provider/model/key call (resolveModelCall)
 */
import type { Target, Provider } from '@/types/chat'
import type { ModelPreset } from '@/components/Settings'

/** Concrete parameters for one streaming call to a provider. */
export interface ModelCall {
  provider: Provider
  model: string
  apiKey?: string
  serverUrl?: string
}

/** The slice of AISettings resolveModelCall needs (structurally satisfied by AISettings). */
export interface ModelCallSettings {
  modelPresets?: ModelPreset[]
  openRouterApiKey?: string
  openRouterModel?: string
  geminiApiKey?: string
  geminiModel?: string
  ollamaUrl?: string
  ollamaModel?: string
}

/**
 * Models offered in the challenger picker: every enabled preset EXCEPT the
 * current main-chat model — a challenger must be a genuinely different voice.
 * Empty result ⇒ the caller should route the user to "Add a model".
 */
export function challengerOptions(presets: ModelPreset[] | undefined, mainKey: string | undefined): Target[] {
  return (presets ?? [])
    .filter(p => p.enabled && p.id !== mainKey)
    .map(p => ({ provider: p.provider, key: p.id, label: p.label }))
}

/**
 * Resolve the saved challenger for use right now. Returns null — meaning "open the
 * picker" — when the user must (re)choose: it's unset, it collapsed onto the main
 * model, or its preset was deleted/disabled since they picked it.
 */
export function resolveChallengerTarget(
  challenger: Target | null | undefined,
  presets: ModelPreset[] | undefined,
  mainKey: string | undefined,
): Target | null {
  if (!challenger) return null
  if (challenger.key === mainKey) return null
  const preset = (presets ?? []).find(p => p.id === challenger.key && p.enabled)
  if (!preset) return null
  return { provider: preset.provider, key: preset.id, label: preset.label }
}

/**
 * Map a chosen Target to a concrete call. Crucially, OpenRouter resolves to the
 * preset's own model (e.g. anthropic/claude-haiku-4-5) — NOT the hard-coded
 * QWEN3/OSS the drift pipeline used to force. Per-preset apiKey wins, falling
 * back to the provider-wide key in settings.
 */
export function resolveModelCall(target: Target, settings: ModelCallSettings): ModelCall {
  const preset = (settings.modelPresets ?? []).find(p => p.id === target.key)
  if (target.provider === 'gemini') {
    return {
      provider: 'gemini',
      model: preset?.model || settings.geminiModel || '',
      apiKey: preset?.apiKey || settings.geminiApiKey,
    }
  }
  if (target.provider === 'openrouter') {
    return {
      provider: 'openrouter',
      model: preset?.model || settings.openRouterModel || '',
      apiKey: preset?.apiKey || settings.openRouterApiKey,
    }
  }
  return {
    provider: 'ollama',
    model: preset?.model || settings.ollamaModel || '',
    serverUrl: preset?.serverUrl || settings.ollamaUrl,
  }
}
