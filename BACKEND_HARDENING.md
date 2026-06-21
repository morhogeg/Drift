# Backend Hardening — Task List (prioritized)

> **SCOPE FOR THE CURRENT SESSION: item #1 ONLY, then stop and report.**
> Items 2–5 are cloud-path code and cloud is OFF in production — do not touch them
> now; they're for the future cloud-enablement pass. Do not start them even if #1
> finishes quickly.

Handoff from a prior session that shipped pre-launch UX fixes. These backend items
were **deliberately deferred** and are NOT yet done. Work them in the order below.

**Ground rules for this session**
- Repo: `/Users/morhogeg/Drift`. Branch off `main` first: `git checkout -b claude/backend-hardening`.
- After each item: `npx tsc -b` clean + `npm run test` green before moving on.
- Don't commit to `main` directly; open a branch and let the owner merge.
- Verify behavior live where possible (`npm run dev`).

---

## Tier 1 — Do before launch (affects every user, cloud or not)

### 1. Connection-check polling backoff  ⚠️ MOST URGENT
- **File:** `src/hooks/useConnectionStatus.ts:57`
- **Problem:** `setInterval(() => checkConnection(false), 5000)` pings the provider
  every 5s with no backoff. A user with an invalid or rate-limited (free-tier) key
  hammers the provider indefinitely → OpenRouter/Gemini may rate-limit or lock the
  account. This fires for **all** users, regardless of cloud being on.
- **Fix:** After N consecutive failures, back off exponentially (e.g. 5s → 10s →
  30s → cap at a few minutes); reset to 5s on the first success or when the key
  changes. Don't poll at all while the key is empty.
- **Done when:** an invalid key produces at most a handful of requests/min, and a
  corrected key reconnects promptly.

---

## Tier 2 — Do before enabling cloud accounts (cloud is currently OFF)

These only bite once the owner flips on Firebase/cloud sync (a separate pending
item). Not blocking a cloud-off launch, but must land before cloud goes live.

### 2. Validate restored backup payload (crash/DoS on restore)
- **File:** `src/services/cloudSync.ts` — `pullBackup()` (~line 116), where the
  Firestore doc is parsed/restored.
- **Problem:** Untrusted cloud data is restored without size/shape validation;
  a huge or malformed payload can crash or hang the app on restore.
- **Fix:** Bound array lengths / nesting depth and validate the shape before
  applying. Reject (with a clear error) instead of throwing raw.

### 3. Cloud sync timeouts (hang → data loss)
- **File:** `src/services/cloudSync.ts` — `pushBackup()` (~line 67) and
  `pullBackup()` (~line 116). No timeout today.
- **Fix:** Wrap network ops in an `AbortController` with a 30–60s timeout; surface
  a retriable error instead of an indefinite "syncing" state.

### 4. Clear in-memory key cache on logout (security)
- **File:** `src/services/auth.ts:71` — `signOut()` calls Firebase + `auth.signOut()`
  but never clears the `secureKeys` in-memory cache.
- **Fix:** Clear/zero the `secureKeys` cache in `signOut()` so API keys aren't
  recoverable from memory after logout.

### 5. Warn on merge-restore overwrite (silent data loss)
- **File:** `src/services/backup.ts` — the `mode: 'merge'` snippet path.
- **Problem:** A cloud restore can overwrite a locally-edited snippet with an older
  copy, silently.
- **Fix:** Detect ID collisions and either warn the user or keep newest-by-updatedAt.

---

## Already done — verify only, don't re-implement
- **PrivacyInfo.xcprivacy** is referenced in `ios/App/App.xcodeproj/project.pbxproj`.
  Just confirm it's in the "Copy Bundle Resources" build phase when archiving.

## Context
Pre-launch UX fixes already merged to `main` (error copy, empty states, debug-log
strip, launch splash, stream-abort, onboarding clamp). API keys are confirmed NOT
leaked (BYOK, cloudKeyStrip strips before any write, uid-scoped Firestore rules).
The build is healthy: `tsc -b` clean, 38/38 tests pass.
