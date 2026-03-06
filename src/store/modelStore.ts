/**
 * modelStore — owns model selection state.
 *
 * Per-chat model preferences are persisted in localStorage (small, synchronous,
 * appropriate for this kind of preference data).
 */

import { create } from 'zustand'
import type { Target } from '@/types/chat'

const CHAT_MODEL_PREFS_KEY = 'drift_chat_model_prefs'

export const DEFAULT_TARGET: Target = {
  provider: 'gemini',
  key: 'gemini-flash-lite',
  label: 'Gemini Flash Lite',
}

// Allowed target keys — guards against corrupt/legacy localStorage values
const ALLOWED_KEYS = new Set(['qwen3', 'oss', 'ollama', 'dummy-basic', 'openrouter', 'gemini-flash-lite', 'gemini-flash', 'gemini-flash-25', 'gemini-flash-20'])

/** Normalise a target list, de-duplicating and migrating legacy keys. */
function normaliseTargets(targets: Target[]): Target[] {
  const map = new Map<string, Target>()
  for (const t of targets) {
    // Migrate legacy keys
    const key =
      t.key === 'dummy-basic' ? 'qwen3' : t.key === 'openrouter' ? 'oss' : t.key
    const provider: Target['provider'] =
      t.provider === 'openrouter' || t.provider === 'ollama' || t.provider === 'gemini'
        ? t.provider
        : 'openrouter'
    const label =
      key === 'qwen3' ? 'Qwen3' :
      key === 'oss' ? 'OpenAI OSS' :
      key === 'gemini-flash-lite' ? 'Gemini Flash Lite' :
      key === 'gemini-flash' ? 'Gemini Flash' :
      t.label
    if (ALLOWED_KEYS.has(key)) map.set(key, { provider, key, label })
  }
  return map.size ? Array.from(map.values()) : [DEFAULT_TARGET]
}

function loadPrefsFromStorage(): Record<string, Target[]> {
  try {
    const raw = localStorage.getItem(CHAT_MODEL_PREFS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, Target[]>
    }
    return {}
  } catch {
    return {}
  }
}

function savePrefsToStorage(prefs: Record<string, Target[]>): void {
  try {
    localStorage.setItem(CHAT_MODEL_PREFS_KEY, JSON.stringify(prefs))
  } catch (err) {
    console.error('[modelStore] Failed to save chat model prefs:', err)
  }
}

// ── Store shape ───────────────────────────────────────────────────────────────

interface ModelStore {
  // ── State ──────────────────────────────────────────────────────────────────
  selectedTargets: Target[]
  useOpenRouter: boolean
  /** Per-chat model preferences (chatId → Target[]). */
  chatModelPrefs: Record<string, Target[]>

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Replace the selected targets (de-duplicates and normalises). */
  setSelectedTargets: (targets: Target[]) => void

  /** Toggle a single target in/out of the selection. */
  toggleTarget: (target: Target) => void

  /** Persist per-chat model prefs for a chat id. */
  setChatModelPrefs: (chatId: string, targets: Target[]) => void

  /** Load and return the persisted prefs for a chat (or undefined). */
  loadChatModelPrefs: (chatId: string) => Target[] | undefined

  setUseOpenRouter: (value: boolean) => void
}

export const useModelStore = create<ModelStore>((set, get) => ({
  selectedTargets: [DEFAULT_TARGET],
  useOpenRouter: true,
  chatModelPrefs: loadPrefsFromStorage(),

  // ── setSelectedTargets ─────────────────────────────────────────────────────
  setSelectedTargets(targets: Target[]) {
    set({ selectedTargets: normaliseTargets(targets) })
  },

  // ── toggleTarget ───────────────────────────────────────────────────────────
  toggleTarget(target: Target) {
    const { selectedTargets } = get()
    const exists = selectedTargets.some((t) => t.key === target.key)
    const next = exists
      ? selectedTargets.filter((t) => t.key !== target.key)
      : [...selectedTargets, target]
    set({ selectedTargets: normaliseTargets(next) })
  },

  // ── setChatModelPrefs ──────────────────────────────────────────────────────
  setChatModelPrefs(chatId: string, targets: Target[]) {
    const { chatModelPrefs } = get()
    const next = { ...chatModelPrefs, [chatId]: targets }
    set({ chatModelPrefs: next })
    savePrefsToStorage(next)
  },

  // ── loadChatModelPrefs ─────────────────────────────────────────────────────
  loadChatModelPrefs(chatId: string): Target[] | undefined {
    return get().chatModelPrefs[chatId]
  },

  // ── setUseOpenRouter ───────────────────────────────────────────────────────
  setUseOpenRouter(value: boolean) {
    set({ useOpenRouter: value })
  },
}))
