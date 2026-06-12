# Cloud Accounts + Backup/Restore — Implementation Handoff

**Date:** June 10, 2026
**Status:** ✅ All code complete, verified, and pushed. ⏸️ PRs not yet opened (gh CLI unauthenticated). ⏸️ Owner Firebase setup pending — feature is OFF until then.

---

## 1. What this is

An **optional** cloud account for Drift: sign in with Apple → your chats, drifts, snippets, settings (minus API keys) and theme back up to Firestore and restore on any device. Drift stays 100% local-first — no login wall, fully functional signed out/offline.

**Decisions locked in (do not re-litigate):**
- Backend: **Firebase** (Auth + Firestore)
- Sync model v1: **cloud backup/restore**, NOT real-time sync. Last-write-wins by `updatedAt`
- Sign-in v1: **Apple only** — but `auth.ts` is provider-agnostic so Google/email drop in later without rewrite
- Firestore path: `users/{uid}/backup/current` (one doc per user, JSON-string payload)
- Serialization: **reuses `src/services/backup.ts`** (`buildBackup()` / `restoreBackup({mode:'merge'})`) — no second format

## 2. The zero-interference guarantee

`isCloudEnabled()` in `src/lib/cloudConfig.ts` is the single gate: **true only when all 6 `VITE_FIREBASE_*` env vars are non-blank.** The repo ships them blank (`.env.example`), so on `main`/dev the feature is completely OFF:

- No Firebase init, no auth listeners, no Account UI, no network calls
- Firebase + cloud code are code-split via dynamic `import()` — chunks exist in `dist/` but are **never fetched** when disabled
- Verified with `scripts/verify-cloud-disabled.mjs` (Playwright): no Account UI in Settings, no Firebase requests, no cloud chunks loaded ✅

## 3. Branch stack (all pushed to origin)

```
main
└── feature/cloud-accounts        base: firestore.rules + .env.example placeholders
    └── feature/cloud-auth        Phase 1: auth foundation
        └── feature/cloud-sync    Phase 2: sync layer + key-strip tests
            └── feature/cloud-ui  Phase 3: Account UI + verify scripts + docs  ← YOU ARE HERE
```

Each phase builds clean (`npm run build`) and stays inert when cloud is disabled, so any phase can be reverted independently. **PRs (still to open, each into `feature/cloud-accounts`):** cloud-auth, cloud-sync, cloud-ui.

## 4. Files by phase

### Phase 1 — Auth (`feature/cloud-auth`)
| File | Role |
|---|---|
| `src/lib/cloudConfig.ts` | `isCloudEnabled()` + typed env access. THE gate. |
| `src/services/firebase.ts` | Lazy dynamic-import init of app/auth/firestore, once, only when enabled |
| `src/services/auth.ts` | `signInWithApple()` / `signOut()` / `onAuthChange()` / `getCurrentUser()`. iOS native via `@capacitor-firebase/authentication` (`skipNativeAuth: true` → credential handed to JS SDK), web via `signInWithPopup`. Normalized `CloudUser {uid, displayName, email}` |
| `src/store/authStore.ts` | Zustand: `user`, `status`, `authError` + (Phase 2) `syncStatus`, `lastSyncedAt`, `syncError` |
| deps | `firebase@^12.14`, `@capacitor-firebase/authentication@^8.3` (Capacitor 8 compatible) |

### Phase 2 — Sync (`feature/cloud-sync`)
| File | Role |
|---|---|
| `src/services/cloudSync.ts` | `pushBackup()` = buildBackup → deep-strip → assert clean → `setDoc(users/{uid}/backup/current, {format, version, payload: JSON-string, counts, updatedAt: serverTimestamp()})`. `pullBackup()` = getDoc → `parseBackup` → `restoreBackup(merge)` (auto-push suppressed during restore) → `chatStore.loadChatsFromDB()` refresh. Debounced 5s auto-push, in-flight coalescing, ~950KB payload cap (Firestore 1MiB doc limit). `initCloudSync()`: on sign-in → pull-merge → converge-push → enable auto-push; on sign-out → disable |
| `src/services/cloudKeyStrip.ts` | Pure, zero-dep: `stripApiKeysDeep` (removes any field matching `/apikey/i` at any depth), `findApiKeyFields` (dotted leak paths), `assertNoApiKeys` (throws rather than uploads) |
| `src/services/cloudKeyStrip.test.ts` | **6 vitest tests** (`npm test` → `vitest run --dir src`): strips top-level/preset/nested keys, case-insensitive, preserves non-secret data, no input mutation, exact leak paths, assert throws/passes |
| `src/services/cloudHooks.ts` | Dependency-free change bus (`onLocalDataChange`/`emitLocalDataChange`). No subscribers when disabled ⇒ emit is a no-op |

**Existing-file touches (the only ones, all inert when disabled):**
- `src/services/db.ts` — 3 one-line `emitLocalDataChange()` calls after successful chat put/delete/clear
- `src/main.tsx` — guarded `if (isCloudEnabled()) import('./services/cloudSync').then(m => m.initCloudSync())`. **Deliberate third touch point** beyond the spec's two: auto-push + auth listeners must live app-wide, not just while Settings is mounted. Zero-cost when disabled (the dynamic import never executes)
- `src/store/authStore.ts` — sync-status fields
- `package.json` — `"test": "vitest run --dir src"` + vitest devDep

### Phase 3 — UI (`feature/cloud-ui`)
| File | Role |
|---|---|
| `src/components/account/AccountSection.tsx` | "Account" section in Settings, ABOVE Models, rendered only when enabled. Signed out: pitch line + gradient Sign in. Signed in: gradient avatar, identity, subtle sync dot (amber pulse syncing / emerald synced + relative time / red error), Back up now, Restore (confirm + reload, mirrors local import), Sign out. Mirrors Settings' SectionHeader/SettingsGroup markup |
| `src/components/account/SignInSheet.tsx` | Glassmorphic bottom sheet, framer-motion entrance (shared `EASE_OUT_EXPO`), glowing violet/pink orb, Apple brand SVG button, copy: "Back up your chats & drifts across devices. Your API key stays on this device." |
| `src/components/Settings.tsx` | Minimal edit: `lazy(() => import('./account/AccountSection'))` + gated render — Account chunk never fetched when disabled |
| `scripts/verify-cloud-disabled.mjs` | Playwright acceptance proof for default builds (run after `npm run build`) |
| `scripts/verify-cloud-enabled.mjs` | Smoke for env-filled builds: Account renders, sheet opens (usage with dummy env in file header) |

## 5. Verification status (all green as of Jun 10)

- ✅ `npm run build` clean on every branch
- ✅ `npm test` — 6/6 key-strip tests
- ✅ Disabled mode proven: `node scripts/verify-cloud-disabled.mjs` → no Account UI, no Firebase init, no cloud requests; Firebase absent from `index.html` preloads and main chunk
- ✅ Enabled-mode UI proven with dummy env: build with `VITE_FIREBASE_*=demo…` → `node scripts/verify-cloud-enabled.mjs` → Account section + sign-in sheet render on-brand
- ⏳ NOT verified (impossible without owner console setup, intentionally not faked): real Apple sign-in, real Firestore round-trip, cross-device restore, rules enforcement against a live project

## 6. Remaining work — next session

1. **Open the 3 PRs** (blocked only on `gh auth login`):
   - `feature/cloud-auth` → `feature/cloud-accounts`
   - `feature/cloud-sync` → `feature/cloud-accounts`
   - `feature/cloud-ui` → `feature/cloud-accounts`
2. **After owner setup:** real-flow test — web Apple sign-in, push, wipe a browser profile, sign in, pull restores everything except API keys; local change auto-pushes within ~5s
3. Possible follow-ups: surface sync status outside Settings; conflict UX beyond last-write-wins; Google/email providers; chunked backups if users exceed ~950KB

## 7. OWNER manual checklist (turns the feature ON)

1. **Firebase console:** create/select project → add a **Web app** → copy config into `.env` as `VITE_FIREBASE_*` (names in `.env.example`). *Filling these is the feature flag.*
2. **Firebase Auth:** Authentication → Sign-in method → enable **Apple**
3. **Apple Developer:** Services ID for web sign-in (return URL `https://<project>.firebaseapp.com/__/auth/handler`); in Xcode add **Sign in with Apple** capability to the App target
4. **Firestore:** create database → `firebase deploy --only firestore:rules` (rules already at `firestore.rules`)
5. **iOS:** put `GoogleService-Info.plist` in `ios/App/App/` → `npx cap sync ios`.
   ⚠️ **Do NOT `cap sync` + build iOS from these branches before the plist exists** — the `@capacitor-firebase/authentication` pod expects it and the app can crash at launch. Web builds always safe.
6. Smoke: build with env set → `node scripts/verify-cloud-enabled.mjs` → real Apple sign-in on web

## 8. Gotchas / design notes for whoever continues

- **Backup payload is a JSON string field**, not nested Firestore maps — sidesteps Firestore's nested-array limits and keeps `parseBackup()` as the single validator for both local files and cloud docs.
- **Auto-push only hooks chat writes** (`chatDB`). Snippets/settings/theme changes don't trigger auto-push by themselves (per spec); they ride along on the next chat-triggered or manual push.
- **Restore suppression:** `pullBackup()` sets `suppressAutoPush` while `restoreBackup` writes through `chatDB`, so a restore can't bounce back up as a push.
- **Sign-in convergence:** pull (merge) first, then one push — so a fresh device gets its data AND the cloud picks up anything local-only.
- `firestore.rules` intentionally doesn't validate payload shape — client-side strip + test is the key guarantee (see comment in the rules file).
- HANDOFF.md "☁️ Cloud accounts" section and DRIFT_STATUS.md carry condensed versions of this doc.
