/**
 * autoBackup — periodic sanitized snapshot of all user data.
 *
 * Reuses buildBackup() (which already strips API keys via sanitizeSettings)
 * and writes the snapshot into localStorage rather than a download, so it
 * happens silently in the background. One snapshot is kept (latest wins);
 * it's a last-resort recovery path if IndexedDB is evicted or corrupted,
 * restorable through the existing Settings → Import flow by pasting the
 * stored JSON into a file.
 */

import { buildBackup } from './backup'

const AUTO_BACKUP_KEY = 'drift_auto_backup'
const AUTO_BACKUP_AT_KEY = 'drift_auto_backup_at'
/** Snapshot at most once per interval (resets on app relaunch). */
const INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h
/** Skip the write if the payload would exceed this (localStorage quota safety). */
const MAX_BYTES = 4 * 1024 * 1024

async function snapshot(): Promise<void> {
  try {
    const backup = await buildBackup()
    const json = JSON.stringify(backup)
    if (json.length > MAX_BYTES) {
      console.warn(`[autoBackup] snapshot skipped — ${json.length} bytes exceeds cap`)
      return
    }
    localStorage.setItem(AUTO_BACKUP_KEY, json)
    localStorage.setItem(AUTO_BACKUP_AT_KEY, backup.exportedAt)
  } catch (err) {
    console.error('[autoBackup] snapshot failed:', err)
  }
}

/** The latest snapshot (JSON string) and when it was taken, if any. */
export function getAutoBackup(): { json: string; at: string } | null {
  const json = localStorage.getItem(AUTO_BACKUP_KEY)
  const at = localStorage.getItem(AUTO_BACKUP_AT_KEY)
  return json ? { json, at: at ?? 'unknown' } : null
}

/**
 * Start the periodic snapshot loop: one snapshot shortly after launch (if the
 * last one is older than the interval), then every interval while running.
 */
export function startAutoBackup(): void {
  const last = localStorage.getItem(AUTO_BACKUP_AT_KEY)
  const due = !last || Date.now() - new Date(last).getTime() > INTERVAL_MS
  // Delay the first snapshot so it never competes with app startup.
  if (due) setTimeout(snapshot, 15_000)
  setInterval(snapshot, INTERVAL_MS)
}
