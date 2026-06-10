/**
 * Proves the cloud-upload payload can never contain API keys.
 *
 * The fixture mirrors a real DriftBackup (buildBackup() output) but with keys
 * deliberately planted at every level — top-level settings, preset-level, and
 * a hypothetical future nested spot — to show stripApiKeysDeep removes them
 * all and assertNoApiKeys catches anything that slips through.
 */
import { describe, it, expect } from 'vitest'
import { stripApiKeysDeep, findApiKeyFields, assertNoApiKeys } from './cloudKeyStrip'

// A backup-shaped fixture with API keys planted everywhere they could appear.
function dirtyBackup() {
  return {
    format: 'drift-backup',
    version: 1,
    exportedAt: '2026-06-10T00:00:00.000Z',
    data: {
      chats: [
        {
          id: 'chat-1',
          title: 'Hello',
          createdAt: '2026-06-09T00:00:00.000Z',
          messages: [{ id: 'm1', text: 'hi', isUser: true, timestamp: '2026-06-09T00:00:00.000Z' }],
        },
      ],
      snippets: [{ id: 's1', content: 'snippet' }],
      settings: {
        useOpenRouter: false,
        geminiApiKey: 'AIzaSy-SECRET',
        openRouterApiKey: 'sk-or-v1-SECRET',
        geminiModel: 'gemini-flash',
        modelPresets: [
          { id: 'p1', provider: 'gemini', label: 'Gemini', enabled: true, apiKey: 'AIzaSy-PRESET-SECRET' },
          { id: 'p2', provider: 'ollama', label: 'Ollama', enabled: false, serverUrl: 'http://localhost:11434' },
          // future-proofing: a key buried one level deeper than today's shape
          { id: 'p3', provider: 'openrouter', label: 'OR', enabled: true, extra: { apiKey: 'sk-nested-SECRET' } },
        ],
      },
      theme: 'dark',
    },
  }
}

describe('stripApiKeysDeep', () => {
  it('removes every API-key field at every depth', () => {
    const stripped = stripApiKeysDeep(dirtyBackup()) as ReturnType<typeof dirtyBackup>
    expect(findApiKeyFields(stripped)).toEqual([])
    // and the serialized payload — what actually gets uploaded — is clean too
    expect(JSON.stringify(stripped)).not.toMatch(/apikey|SECRET/i)
  })

  it('matches key fields case-insensitively (geminiApiKey, openRouterApiKey, apiKey)', () => {
    const stripped = stripApiKeysDeep({ geminiApiKey: 'a', openRouterApiKey: 'b', apiKey: 'c', APIKEY: 'd' })
    expect(Object.keys(stripped as object)).toEqual([])
  })

  it('preserves all non-secret data intact', () => {
    const stripped = stripApiKeysDeep(dirtyBackup()) as ReturnType<typeof dirtyBackup>
    expect(stripped.data.chats).toHaveLength(1)
    expect(stripped.data.chats[0].messages[0].text).toBe('hi')
    expect(stripped.data.snippets).toEqual([{ id: 's1', content: 'snippet' }])
    expect(stripped.data.settings.modelPresets).toHaveLength(3)
    expect(stripped.data.settings.modelPresets[1].serverUrl).toBe('http://localhost:11434')
    expect(stripped.data.theme).toBe('dark')
  })

  it('does not mutate its input', () => {
    const input = dirtyBackup()
    stripApiKeysDeep(input)
    expect(input.data.settings.geminiApiKey).toBe('AIzaSy-SECRET')
  })
})

describe('findApiKeyFields / assertNoApiKeys', () => {
  it('reports the exact path of every leak', () => {
    expect(findApiKeyFields(dirtyBackup()).sort()).toEqual(
      [
        'data.settings.geminiApiKey',
        'data.settings.openRouterApiKey',
        'data.settings.modelPresets.0.apiKey',
        'data.settings.modelPresets.2.extra.apiKey',
      ].sort()
    )
  })

  it('assertNoApiKeys throws on a dirty payload and passes on a clean one', () => {
    expect(() => assertNoApiKeys(dirtyBackup())).toThrow(/refusing to upload/)
    expect(() => assertNoApiKeys(stripApiKeysDeep(dirtyBackup()))).not.toThrow()
  })
})
