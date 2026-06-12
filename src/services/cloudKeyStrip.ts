/**
 * cloudKeyStrip — guarantee that API keys NEVER leave the device.
 *
 * `buildBackup()` already sanitizes the settings object, but the cloud path
 * adds defense in depth: before any Firestore write we deep-strip every field
 * whose name contains "apikey" (case-insensitive — covers `geminiApiKey`,
 * `openRouterApiKey` and every preset-level `apiKey`), then ASSERT the result
 * is clean and refuse to upload otherwise.
 *
 * Pure module, zero dependencies — unit-tested in cloudKeyStrip.test.ts.
 */

const API_KEY_FIELD = /apikey/i

/**
 * Return a deep copy of `value` with every object field whose name contains
 * "apikey" removed, at any depth (objects and arrays).
 */
export function stripApiKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripApiKeysDeep(v)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (API_KEY_FIELD.test(k)) continue
      out[k] = stripApiKeysDeep(v)
    }
    return out as T
  }
  return value
}

/**
 * Find every remaining API-key field in `value`, returned as dotted paths
 * (e.g. "data.settings.modelPresets.2.apiKey"). Empty array == clean.
 */
export function findApiKeyFields(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findApiKeyFields(v, path ? `${path}.${i}` : String(i)))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
      const p = path ? `${path}.${k}` : k
      return API_KEY_FIELD.test(k) ? [p] : findApiKeyFields(v, p)
    })
  }
  return []
}

/** Throw if `value` still contains any API-key field. Last line of defense. */
export function assertNoApiKeys(value: unknown): void {
  const leaks = findApiKeyFields(value)
  if (leaks.length > 0) {
    throw new Error(`[cloud] refusing to upload: API key fields present at ${leaks.join(', ')}`)
  }
}
