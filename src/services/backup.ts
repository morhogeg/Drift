/**
 * Local backup — export/import all of the user's Drift data as a single JSON
 * file. A purely client-side safety net (no backend) so a person's chats and
 * drifts survive a cleared browser or a move to another device.
 *
 * Included: chats + drifts (IndexedDB), snippets + AI settings + theme
 * (localStorage). Excluded: the embeddings vector cache — it's regenerable from
 * the chats, so bundling it would bloat the file for no real benefit.
 */
import { chatDB, type DBChatSession } from './db'

const SNIPPETS_KEY = 'drift_snippets'
const SETTINGS_KEY = 'drift_ai_settings'
const THEME_KEY = 'drift-theme'

export const BACKUP_FORMAT = 'drift-backup'
export const BACKUP_VERSION = 1

export interface DriftBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: {
    chats: DBChatSession[]
    snippets: unknown[]
    settings: unknown | null
    theme: string | null
  }
}

export interface ImportResult {
  chats: number
  snippets: number
  settings: boolean
}

interface ImportOptions {
  /** 'replace' wipes existing chats first; 'merge' overwrites by id, keeps the rest. */
  mode?: 'replace' | 'merge'
}

function readJSON(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Gather everything into a single backup object. */
export async function buildBackup(): Promise<DriftBackup> {
  const chats = await chatDB.getAll()
  const snippets = readJSON(SNIPPETS_KEY)
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      chats,
      snippets: Array.isArray(snippets) ? snippets : [],
      settings: readJSON(SETTINGS_KEY),
      theme: localStorage.getItem(THEME_KEY),
    },
  }
}

/** Build a backup and trigger a browser download. Returns counts for the UI. */
export async function exportBackup(): Promise<{ chats: number; snippets: number }> {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `drift-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return { chats: backup.data.chats.length, snippets: backup.data.snippets.length }
}

/** Validate + parse a backup file's text. Throws a clear, user-facing error. */
export function parseBackup(text: string): DriftBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("That file isn't valid JSON.")
  }
  const b = parsed as Partial<DriftBackup> | null
  if (!b || b.format !== BACKUP_FORMAT || !b.data) {
    throw new Error("That doesn't look like a Drift backup file.")
  }
  if (typeof b.version === 'number' && b.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of Drift. Please update first.')
  }
  return b as DriftBackup
}

/** Restore a parsed backup into IndexedDB + localStorage. */
export async function restoreBackup(backup: DriftBackup, opts: ImportOptions = {}): Promise<ImportResult> {
  const mode = opts.mode ?? 'replace'
  const { chats, snippets, settings, theme } = backup.data

  // Chats (IndexedDB)
  if (mode === 'replace') await chatDB.clear()
  let chatCount = 0
  for (const chat of chats ?? []) {
    if (chat && typeof chat.id === 'string') {
      await chatDB.put(chat)
      chatCount++
    }
  }

  // Snippets (localStorage)
  let snippetCount = 0
  if (Array.isArray(snippets)) {
    if (mode === 'merge') {
      const existing = readJSON(SNIPPETS_KEY)
      const byId = new Map<string, unknown>()
      if (Array.isArray(existing)) for (const s of existing) { const id = (s as { id?: string })?.id; if (id) byId.set(id, s) }
      for (const s of snippets) { const id = (s as { id?: string })?.id; if (id) byId.set(id, s) }
      localStorage.setItem(SNIPPETS_KEY, JSON.stringify(Array.from(byId.values())))
    } else {
      localStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets))
    }
    snippetCount = snippets.length
  }

  // Settings + theme (localStorage)
  let settingsRestored = false
  if (settings && typeof settings === 'object') {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    settingsRestored = true
  }
  if (typeof theme === 'string') {
    localStorage.setItem(THEME_KEY, theme)
  }

  return { chats: chatCount, snippets: snippetCount, settings: settingsRestored }
}

/** Read a File (from an <input type="file">) and restore it. */
export async function importBackupFromFile(file: File, opts: ImportOptions = {}): Promise<ImportResult> {
  const text = await file.text()
  const backup = parseBackup(text)
  return restoreBackup(backup, opts)
}
