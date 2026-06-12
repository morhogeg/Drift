/**
 * cloudSync — optional cloud backup/restore for the signed-in user.
 *
 * Model (v1): NOT real-time sync. The whole local dataset is snapshotted via
 * the existing buildBackup() and stored as ONE Firestore document at
 * users/{uid}/backup/current. Restore feeds the blob back through
 * restoreBackup({ mode: 'merge' }). Last write wins by `updatedAt`.
 *
 * Secrets: API keys are deep-stripped and then asserted absent before every
 * upload (see cloudKeyStrip.ts). Keys live in localStorage only, forever.
 *
 * Everything here is inert unless `isCloudEnabled()` AND a user is signed in.
 * Wired up once from main.tsx via initCloudSync(), itself gated.
 */

import { isCloudEnabled } from '@/lib/cloudConfig'
import { getFirebase } from './firebase'
import { onAuthChange } from './auth'
import { buildBackup, parseBackup, restoreBackup, type ImportResult } from './backup'
import { stripApiKeysDeep, assertNoApiKeys } from './cloudKeyStrip'
import { onLocalDataChange } from './cloudHooks'
import { useAuthStore, type SyncStatus } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Quiet period after the last local change before an auto-push fires. */
const AUTO_PUSH_DEBOUNCE_MS = 5_000

// The backup is stored as a single JSON string field. Firestore documents cap
// at ~1 MiB; refuse pushes beyond a safety margin rather than failing opaquely.
const MAX_PAYLOAD_BYTES = 950_000

// ── Module state ──────────────────────────────────────────────────────────────

let autoPushTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeChanges: (() => void) | null = null
/** True while a restore is writing locally — its own writes must not re-push. */
let suppressAutoPush = false
let pushInFlight = false
let pushQueued = false

// ── Status plumbing ───────────────────────────────────────────────────────────

function setSync(partial: { syncStatus?: SyncStatus; lastSyncedAt?: Date | null; syncError?: string | null }) {
  useAuthStore.getState().setSync(partial)
}

export type { SyncStatus } from '@/store/authStore'

// ── Firestore doc helpers ─────────────────────────────────────────────────────

async function backupDocRef() {
  const { db } = await getFirebase()
  const { doc } = await import('firebase/firestore')
  const uid = useAuthStore.getState().user?.uid
  if (!uid) throw new Error('[cloud] no signed-in user')
  return { ref: doc(db, 'users', uid, 'backup', 'current') }
}

// ── Push ──────────────────────────────────────────────────────────────────────

/**
 * Snapshot everything locally, strip + assert no API keys, and upload as
 * users/{uid}/backup/current. Returns counts for the UI.
 */
export async function pushBackup(): Promise<{ chats: number; snippets: number }> {
  if (!isCloudEnabled()) throw new Error('[cloud] push requested while cloud is disabled')
  if (pushInFlight) {
    // Coalesce: remember that another push was requested and let the current
    // one finish; the trailing push picks up the latest local state.
    pushQueued = true
    return { chats: 0, snippets: 0 }
  }
  pushInFlight = true
  setSync({ syncStatus: 'syncing', syncError: null })
  try {
    const backup = stripApiKeysDeep(await buildBackup())
    assertNoApiKeys(backup) // hard guarantee — throws rather than uploads keys

    const payload = JSON.stringify(backup)
    if (payload.length > MAX_PAYLOAD_BYTES) {
      throw new Error('Backup is too large for cloud sync (over ~1 MB). Use the local export instead.')
    }

    const { ref } = await backupDocRef()
    const { setDoc, serverTimestamp } = await import('firebase/firestore')
    await setDoc(ref, {
      format: backup.format,
      version: backup.version,
      payload,
      counts: { chats: backup.data.chats.length, snippets: backup.data.snippets.length },
      updatedAt: serverTimestamp(),
    })

    setSync({ syncStatus: 'synced', lastSyncedAt: new Date(), syncError: null })
    return { chats: backup.data.chats.length, snippets: backup.data.snippets.length }
  } catch (err) {
    setSync({ syncStatus: 'error', syncError: err instanceof Error ? err.message : 'Backup failed.' })
    throw err
  } finally {
    pushInFlight = false
    if (pushQueued) {
      pushQueued = false
      scheduleAutoPush()
    }
  }
}

// ── Pull ──────────────────────────────────────────────────────────────────────

/**
 * Download the cloud backup (if any) and merge it into local data. Returns
 * restore counts, or null when the user has no cloud backup yet.
 */
export async function pullBackup(): Promise<ImportResult | null> {
  if (!isCloudEnabled()) throw new Error('[cloud] pull requested while cloud is disabled')
  setSync({ syncStatus: 'syncing', syncError: null })
  try {
    const { ref } = await backupDocRef()
    const { getDoc } = await import('firebase/firestore')
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      setSync({ syncStatus: 'synced', lastSyncedAt: new Date() })
      return null
    }

    const payload = snap.data()?.payload
    if (typeof payload !== 'string') throw new Error('Cloud backup is malformed.')
    const backup = parseBackup(payload) // same validation as local import

    // The restore writes through chatDB — those writes must not bounce back up.
    suppressAutoPush = true
    let result: ImportResult
    try {
      result = await restoreBackup(backup, { mode: 'merge' })
    } finally {
      suppressAutoPush = false
    }

    // Refresh in-memory state so merged chats appear without a reload.
    await useChatStore.getState().loadChatsFromDB()

    setSync({ syncStatus: 'synced', lastSyncedAt: new Date(), syncError: null })
    return result
  } catch (err) {
    setSync({ syncStatus: 'error', syncError: err instanceof Error ? err.message : 'Restore failed.' })
    throw err
  }
}

// ── Auto-push ─────────────────────────────────────────────────────────────────

function scheduleAutoPush(): void {
  if (suppressAutoPush) return
  if (useAuthStore.getState().status !== 'signed-in') return
  if (autoPushTimer) clearTimeout(autoPushTimer)
  autoPushTimer = setTimeout(() => {
    autoPushTimer = null
    pushBackup().catch((err) => console.error('[cloud] auto-push failed:', err))
  }, AUTO_PUSH_DEBOUNCE_MS)
}

function enableAutoPush(): void {
  if (unsubscribeChanges) return
  unsubscribeChanges = onLocalDataChange(scheduleAutoPush)
}

function disableAutoPush(): void {
  unsubscribeChanges?.()
  unsubscribeChanges = null
  if (autoPushTimer) {
    clearTimeout(autoPushTimer)
    autoPushTimer = null
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Wire auth state → sync lifecycle. Called once from main.tsx, and only when
 * `isCloudEnabled()` — when cloud is disabled this function never runs.
 *
 * On sign-in: pull (merge) first so a fresh device gets its data back, then
 * push once so cloud also has anything that existed only locally, then keep
 * auto-pushing after local changes.
 */
export function initCloudSync(): void {
  if (!isCloudEnabled()) return
  onAuthChange((user) => {
    const store = useAuthStore.getState()
    store.setUser(user)
    if (user) {
      pullBackup()
        .then(() => pushBackup())
        .catch((err) => console.error('[cloud] initial sync failed:', err))
        .finally(() => enableAutoPush())
    } else {
      disableAutoPush()
      setSync({ syncStatus: 'signed-out', lastSyncedAt: null, syncError: null })
    }
  })
}
