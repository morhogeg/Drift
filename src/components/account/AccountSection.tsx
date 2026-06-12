/**
 * AccountSection — the "Account" block at the top of Settings.
 *
 * Rendered ONLY when `isCloudEnabled()` (Settings gates + lazy-loads it, so
 * none of this code is even fetched in a local-only build). Signed out it
 * offers Apple sign-in; signed in it shows identity, last-sync time and the
 * manual Back up / Restore / Sign out actions. Styling mirrors the
 * SectionHeader/SettingsGroup/SettingsRow patterns in Settings.tsx.
 */

import { useState } from 'react'
import { CloudUpload, CloudDownload, LogOut, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { signOut } from '../../services/auth'
import { pushBackup, pullBackup } from '../../services/cloudSync'
import SignInSheet from './SignInSheet'

// ── Small helpers (mirror Settings.tsx look) ──────────────────────────────────

function relativeTime(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 10) return 'Just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return date.toLocaleDateString()
}

/** Subtle sync-status dot + label — quiet, no nagging. */
function SyncIndicator() {
  const { syncStatus, lastSyncedAt } = useAuthStore()
  if (syncStatus === 'signed-out') return null
  const dot =
    syncStatus === 'syncing'
      ? 'bg-amber-400 animate-pulse'
      : syncStatus === 'error'
      ? 'bg-red-400'
      : 'bg-emerald-400'
  const label =
    syncStatus === 'syncing'
      ? 'Syncing'
      : syncStatus === 'error'
      ? 'Sync issue'
      : lastSyncedAt
      ? `Synced ${relativeTime(lastSyncedAt)}`
      : 'Synced'
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function AccountSection() {
  const { user, syncStatus, syncError } = useAuthStore()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'push' | 'pull' | null>(null)

  const handleBackupNow = async () => {
    if (busyAction) return
    setBusyAction('push')
    setActionStatus(null)
    try {
      const { chats, snippets } = await pushBackup()
      setActionStatus(`Backed up ${chats} ${chats === 1 ? 'chat' : 'chats'} and ${snippets} ${snippets === 1 ? 'snippet' : 'snippets'}.`)
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Backup failed. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  const handleRestore = async () => {
    if (busyAction) return
    const ok = window.confirm(
      'Restore from your cloud backup?\n\nCloud chats, snippets and settings will be merged into this device, then the app reloads.'
    )
    if (!ok) return
    setBusyAction('pull')
    setActionStatus(null)
    try {
      const res = await pullBackup()
      if (!res) {
        setActionStatus('No cloud backup yet — use "Back up now" first.')
        return
      }
      setActionStatus(`Restored ${res.chats} chats and ${res.snippets} snippets. Reloading…`)
      // Reload so restored settings/theme apply everywhere (same as local import).
      setTimeout(() => window.location.reload(), 700)
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Restore failed. Please try again.')
    } finally {
      setBusyAction(null)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setActionStatus(null)
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Sign-out failed.')
    }
  }

  const actionBtn =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border/60 text-text-muted hover:text-text-primary hover:border-accent-violet/40 transition-colors text-xs disabled:opacity-50'

  return (
    <>
      {/* Section header — mirrors SectionHeader in Settings.tsx */}
      <div className="px-5 pt-6 pb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-text-muted/80">
          Account
        </span>
        <SyncIndicator />
      </div>

      {/* Group card — mirrors SettingsGroup in Settings.tsx */}
      <div className="mx-4 rounded-2xl bg-gradient-to-b from-black/[0.02] to-transparent dark:from-white/[0.045] dark:to-white/[0.015] border border-dark-border divide-y divide-dark-border overflow-hidden shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
        {!user ? (
          /* ── Signed out ── */
          <div className="flex items-center justify-between gap-4 px-4 min-h-[60px] py-3">
            <div className="min-w-0">
              <p className="text-sm text-text-primary leading-snug">Cloud backup</p>
              <p className="text-xs text-text-muted mt-0.5 leading-snug">
                Back up your chats &amp; drifts across devices. Your API key stays on this device.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-accent-violet to-accent-pink hover:opacity-90 active:scale-[0.98] shadow-lg shadow-accent-violet/20 transition-all"
            >
              Sign in
            </button>
          </div>
        ) : (
          /* ── Signed in ── */
          <>
            {/* Identity */}
            <div className="flex items-center gap-3 px-4 min-h-[60px] py-3">
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #ff006e)',
                  boxShadow: '0 0 14px rgba(168,85,247,0.45)',
                }}
              >
                {(user.displayName || user.email || 'D').charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary truncate leading-snug">
                  {user.displayName || 'Apple account'}
                </p>
                <p className="text-xs text-text-muted truncate mt-0.5">
                  {user.email || 'Signed in with Apple'}
                </p>
              </div>
            </div>

            {/* Manual backup / restore */}
            <div className="flex items-center justify-between gap-4 px-4 min-h-[52px] py-3">
              <p className="text-sm text-text-primary leading-snug">Cloud backup</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleBackupNow} disabled={busyAction !== null} className={actionBtn}>
                  {busyAction === 'push' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
                  Back up now
                </button>
                <button type="button" onClick={handleRestore} disabled={busyAction !== null} className={actionBtn}>
                  {busyAction === 'pull' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
                  Restore
                </button>
              </div>
            </div>

            {/* Sign out */}
            <div className="flex items-center justify-between gap-4 px-4 min-h-[52px] py-3">
              <p className="text-sm text-text-muted leading-snug">Your data stays on this device after signing out</p>
              <button type="button" onClick={handleSignOut} className={actionBtn}>
                <LogOut className="w-3 h-3" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {(actionStatus || (syncStatus === 'error' && syncError)) && (
        <p className="px-5 pt-2 text-xs text-text-muted leading-snug">
          {actionStatus ?? syncError}
        </p>
      )}

      <SignInSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
