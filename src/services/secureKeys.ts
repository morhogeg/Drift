/**
 * secureKeys — iOS Keychain storage for API keys.
 *
 * On native iOS the plaintext API keys are kept OUT of localStorage: they live
 * in the Keychain (via capacitor-secure-storage-plugin) and are surfaced to the
 * rest of the app through a synchronous in-memory cache so settingsStorage can
 * stay sync. On web this module is a no-op and keys stay in localStorage as
 * before.
 *
 * Lifecycle:
 *  - App init awaits init(), which loads Keychain keys into the cache and
 *    performs a one-time migration of any keys found in localStorage
 *    (copy → Keychain, then strip from the stored JSON).
 *  - settingsStorage.get() overlays the cache on native.
 *  - settingsStorage.save() routes key fields here and persists the rest.
 */

import { Capacitor } from '@capacitor/core'

const KEYCHAIN_KEY = 'drift_api_keys'

/** Key-bearing fields managed by this module. */
export interface SecureKeyBundle {
  geminiApiKey?: string
  openRouterApiKey?: string
  /** Per-preset keys, keyed by preset id. */
  presetKeys?: Record<string, string>
}

export const isNativeSecure = () => Capacitor.isNativePlatform()

let cache: SecureKeyBundle = {}
let ready = false

async function plugin() {
  const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin')
  return SecureStoragePlugin
}

async function readKeychain(): Promise<SecureKeyBundle> {
  try {
    const p = await plugin()
    const { value } = await p.get({ key: KEYCHAIN_KEY })
    return value ? JSON.parse(value) : {}
  } catch {
    // get() rejects when the key doesn't exist yet — treat as empty.
    return {}
  }
}

async function writeKeychain(bundle: SecureKeyBundle): Promise<void> {
  try {
    const p = await plugin()
    await p.set({ key: KEYCHAIN_KEY, value: JSON.stringify(bundle) })
  } catch (err) {
    console.error('[secureKeys] Keychain write failed:', err)
  }
}

export const secureKeys = {
  /** Synchronous cache access (empty until init() resolves on native). */
  get(): SecureKeyBundle {
    return cache
  },

  isReady(): boolean {
    return ready
  },

  /** Update the cached keys and persist them to the Keychain (native only). */
  set(bundle: SecureKeyBundle): void {
    cache = bundle
    if (isNativeSecure()) void writeKeychain(bundle)
  },

  /**
   * Load Keychain keys into the cache. Returns true when anything was loaded
   * or migrated, so the caller knows to refresh settings-derived state.
   */
  async init(): Promise<boolean> {
    if (!isNativeSecure()) {
      ready = true
      return false
    }
    cache = await readKeychain()
    ready = true

    // One-time migration: lift any keys still sitting in localStorage into the
    // Keychain, then strip them from the stored JSON.
    let migrated = false
    try {
      const raw = localStorage.getItem('drift_ai_settings')
      if (raw) {
        const parsed = JSON.parse(raw)
        const presetKeys: Record<string, string> = { ...cache.presetKeys }
        if (Array.isArray(parsed.modelPresets)) {
          for (const p of parsed.modelPresets) {
            if (p?.id && p?.apiKey) {
              presetKeys[p.id] = p.apiKey
              delete p.apiKey
              migrated = true
            }
          }
        }
        if (parsed.geminiApiKey || parsed.openRouterApiKey) migrated = true
        if (migrated) {
          cache = {
            geminiApiKey: parsed.geminiApiKey || cache.geminiApiKey,
            openRouterApiKey: parsed.openRouterApiKey || cache.openRouterApiKey,
            presetKeys,
          }
          delete parsed.geminiApiKey
          delete parsed.openRouterApiKey
          localStorage.setItem('drift_ai_settings', JSON.stringify(parsed))
          await writeKeychain(cache)
        }
      }
    } catch (err) {
      console.error('[secureKeys] localStorage migration failed:', err)
    }

    return migrated || Boolean(cache.geminiApiKey || cache.openRouterApiKey || Object.keys(cache.presetKeys ?? {}).length)
  },
}
