# Drift — Action Plan (Impact-Ranked)

Source: full product & engineering review, June 2026. Items ranked by impact on product success; each has an effort estimate so impact-per-effort is visible. Work top-down unless noted. Gemini key rotation is handled separately by the owner and intentionally excluded.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Tier 1 — Existential (protects the product's core value)

### 1. [~] Persist in-flight drifts + durable storage
> **Status note (2026-06-12):** Implemented in a separate session (drift-db v3 `drift-temp-drifts` store + `tempDriftDB` in `src/services/db.ts`; write-through + `hydrateTempConversations()` in `src/store/driftStore.ts`; `navigator.storage.persist()` + hydration on mount in `App.tsx`; temp cleanup on save-as-chat in `useDriftActions.ts`; 4 fake-indexeddb tests in `src/store/driftStore.test.ts`, full suite green). **That work has NOT been pushed to any remote branch yet** — push/merge it, do one real on-device kill-and-restore check, then flip this to `[x]`.
- **Impact:** Highest. Unsaved drift conversations live only in an in-memory `Map` in `src/store/driftStore.ts` — any app kill, tab close, or iOS process eviction silently destroys them. For a product whose value is the accumulated exploration graph, data loss is the worst possible churn event. WKWebView/Safari can also evict IndexedDB under storage pressure.
- **Effort:** Low (1 session).
- **Scope:**
  - Write temp drift conversations to IndexedDB on every message, reusing the existing `chatDB` plumbing in `src/services/db.ts`.
  - Hydrate them back into `driftStore` on startup; clean up when a drift is saved or discarded.
  - Call `navigator.storage.persist()` on launch to request durable storage.
- **Verify:** Start a drift, send messages, kill the app/tab without saving → reopen → drift restores intact.

### 2. [~] Ship cloud sync (accounts + cross-device)
> **Status note (2026-06-12):** All three stacked cloud branches merged into `feature/cloud-accounts-merge` (cloud-ui contained the full stack), conflicts resolved against current main, lockfile regenerated with the firebase deps. tsc + build + 14 tests green; both acceptance scripts pass (`verify-cloud-disabled.mjs`: no Account UI / no Firebase traffic with blank env · `verify-cloud-enabled.mjs`: Account section + Apple sign-in sheet render with dummy env — scripts updated to bypass the new onboarding/login screens). `firestore.rules` audited (per-user subtree isolation, default deny) and syntax-validated via Firebase tooling. **Remaining:** merge the branch to main, then owner setup (Firebase project, `VITE_FIREBASE_*` env, Apple provider, plist, deploy rules) per CLOUD_ACCOUNTS_HANDOFF.md.
- **Impact:** Very high. Today a user's entire graph is trapped on one device — no retention loop, no recovery from device loss, and the prerequisite for any paid tier. The code is already written and key-strip tested on `feature/cloud-auth`, `feature/cloud-sync`, `feature/cloud-ui`.
- **Effort:** Medium (code is done; integration + rules audit + owner setup).
- **Scope:**
  - Merge the three feature branches into main (resolve drift against current main).
  - **Owner action:** create the Firebase project and populate `VITE_FIREBASE_*` env vars.
  - Audit Firestore security rules — users must only read/write their own documents (client-side key stripping is tested; server rules are the real boundary).
- **Verify:** Sign in on web + iOS sim → chat created on one appears on the other; backup contains zero API keys (existing vitest suite).

### 3. [~] Clear App Store launch blockers
> **Status note (2026-06-12):** Code side done — `PrivacyInfo.xcprivacy` wired into the App target (PBXBuildFile/FileReference/group/Resources phase in `project.pbxproj`); simulator build succeeds and the manifest is present in the built `.app` bundle. Manifest accuracy confirmed: no tracking, no tracking domains, outbound only to user-chosen AI providers; collected-data entries assume cloud ships (see HANDOFF.md checklist item 3 for the ship-without-cloud variant). Owner-only steps documented in HANDOFF.md "🚀 App Store submission — owner checklist". Flip to `[x]` after the archive uploads clean and the ASC steps are done.
- **Impact:** Very high. Build 60 is ready, metadata and screenshots are done — the product can't succeed unshipped.
- **Effort:** Low (code side), plus owner-only ASC steps.
- **Scope:**
  - Wire `ios/App/App/PrivacyInfo.xcprivacy` into the Xcode target (file exists, not in target).
  - Confirm the manifest accurately reflects: local-only data, outbound calls only to user-chosen AI providers.
  - Document remaining owner-only steps: App Store Connect app record, age-rating questionnaire, final on-device pass.
- **Verify:** Archive build includes the privacy manifest; checklist of owner steps written into `HANDOFF.md`.

---

## Tier 2 — Foundation (protects velocity and trust)

### 4. [~] CI + secret scanning
> **Status note (2026-06-12):** `.github/workflows/ci.yml` (tsc + vitest + vite build blocking; eslint advisory until the 94 pre-existing errors are ratcheted down), gitleaks job with full-history scan, `.github/dependabot.yml` (npm weekly grouped, actions monthly). `.gitleaks.toml` baselines the one known-leaked Gemini key in history (HANDOFF entry 164 — rotate!) so scans only surface NEW leaks. Verified locally with gitleaks 8.30.1: full history clean with baseline, 3 findings without it, and a planted format-valid dummy key IS caught in both dir and git modes. **Remaining:** confirm workflow green on the first real PR; owner toggles GitHub push protection/secret scanning in repo settings.
- **Impact:** High. There is no automated safety net: no CI, no test enforcement, no secret scanning — in a repo that already had one key leak and is developed at high velocity with AI assistance. This protects every item below it.
- **Effort:** Low (1 session).
- **Scope:**
  - GitHub Actions workflow on PR + main: `tsc -b`, `eslint`, `vitest run`, `vite build`.
  - Add gitleaks (CI job + optional pre-commit hook); enable GitHub push protection / secret scanning on the repo (owner toggle).
  - Dependabot config for npm.
- **Verify:** Workflow green on a test PR; gitleaks catches a planted dummy key in a scratch branch.

### 5. [~] App.tsx decomposition + lens-state persistence
> **Status note (2026-06-12):** Lens-state persistence done (branch `feature/lens-state-persistence`, stacked on `feature/persist-temp-drifts` — merge in that order, both bump drift-db). Connect cards/answers moved from App.tsx refs into driftStore backed by a new v4 `drift-lens-state` IDB store with write-through + hydration; `clearTempConversation` cleans it up; `useDriftActions` no longer takes the cache ref. 3 new store tests (kill-and-restore for cards/answers, cleanup, multi-answer) — suite 15 green, tsc + build clean. The per-term lens registry already rebuilds from persisted driftInfos, so reload coverage is now complete. **Remaining:** the decomposition slices (MessageList, Sidebar, Composer, Welcome out of App.tsx) — several sessions of Tier B slice work, not started.
- **Impact:** High. `App.tsx` is 3,553 lines / 35 `useState` / 16 refs; `DriftPanel` takes 25 props. Critical session state (`lensRegistryRef`, Connect caches) lives in refs and is lost on reload — a documented gap (`DRIFT_STATUS.md`). This class of structure produced the "Connect shows the wrong drift" bugs and slows every future feature.
- **Effort:** Medium-high (several sessions, slice-by-slice with rollback-safe commits).
- **Scope:**
  - Continue the proven Tier B slice method (DriftPanel went 1916→1199 this way; `continue-refactor` skill exists): extract MessageList, Sidebar, Composer, empty-state/Welcome from App.tsx.
  - Move `lensRegistryRef` + Connect card/answer caches into `driftStore` with IndexedDB persistence → lens threads survive reload.
  - Add store-level vitest coverage (chatStore, driftStore mutations) as slices land.
- **Verify:** tsc + build + Playwright smoke after every slice (existing methodology); lens threads restore after reload.

### 6. [~] Security hardening round
> **Status note (2026-06-12):** All three sub-items implemented on `feature/security-hardening`. (1) Keychain: `capacitor-secure-storage-plugin` 0.13 + `src/services/secureKeys.ts` — on native iOS, API keys live in the Keychain behind a sync in-memory cache; one-time migration lifts keys out of localStorage on first launch; `settingsStorage.save()` strips keys from the stored JSON on native; web unchanged. iOS simulator build succeeds with the plugin. (2) CSP: injected at build time via a Vite plugin (dev needs inline preamble/HMR); Playwright run shows zero `securitypolicyviolation` events and the app renders; header variant documented in vite.config.ts for web hosting. (3) Auto-backup: `src/services/autoBackup.ts` — sanitized snapshot 15s after launch then 6-hourly, capped at 4MB; verified the snapshot writes and contains no planted API key. **Remaining:** on-device confirmation that keys are absent from WKWebView localStorage after the migration runs.
- **Impact:** Medium-high. Baseline is strong (react-markdown only, no telemetry, sanitized backups), but keys sit in plaintext localStorage and there's no CSP.
- **Effort:** Low-medium.
- **Scope:**
  - iOS: move API keys from localStorage to Keychain via a Capacitor secure-storage plugin (keep localStorage fallback on web).
  - Add Content-Security-Policy (meta tag for the Capacitor bundle; headers doc for web hosting).
  - Auto-backup: periodic sanitized export using existing `src/services/backup.ts`.
- **Verify:** Keys absent from WKWebView localStorage on device; app functions under the CSP; backup file contains no keys.

---

## Tier 3 — Growth & revenue

### 7. [~] Shareable read-only drift maps
> **Status note (2026-06-12):** Static HTML export shipped on `feature/drift-map-export`. `src/services/driftMapExport.ts` builds a self-contained dark, on-brand HTML page (inline CSS, zero JS/network) from a chat's drift tree — gradient title, lens-colored collapsible nodes, escaped content. Wired to a Share button in the per-chat map header (`DriftKnowledgeGraph.tsx`, shown when the chat has ≥1 drift). 3 tests (tree+lens detection, HTML render + XSS escaping + no external resources, unknown-root null); rendered output screenshot-verified. tsc + build + suite green. **Remaining (deferred):** hosted shareable links — depends on cloud sync (item 2) for storage/serving.
- **Impact:** High for growth — the missing viral surface. Drift maps are the most screenshot-worthy artifact in the app, and the zero-refetch restoration architecture means a map is already a self-contained, replayable artifact that costs no inference to serve.
- **Effort:** Medium (export/render path; hosting decision needed).
- **Scope:** Export a drift tree (nodes, lenses, answers) to a sharable read-only view — start with a static HTML/JSON export, upgrade to hosted links once cloud sync (item 2) exists.

### 8. [~] Managed-key proxy + Pro tier — contract + reference only
> **Status note (2026-06-12):** This is a high-effort server/billing feature (depends on items 2 + 4); a production service can't and shouldn't be stood up autonomously. What's on `feature/managed-proxy-design`: the full **client/server contract** — `server/proxy.mjs` (reference Node proxy: uniform SSE `{delta}`/`{done}` over Gemini + OpenRouter, in-memory quota, **unverified** token decode) and `src/services/proxyClient.ts` (inert unless `VITE_PROXY_URL` set; `streamViaProxy()` async-gen + `QuotaExceededError` on 402). Verified: 3 client tests (delta stream, 402→QuotaExceeded, disabled-by-default) green; live smoke of the reference proxy returns 401 without auth and flips to 402 after the free daily allowance. `docs/MANAGED_PROXY.md` lists everything productionizing needs. **Remaining (owner/server, the bulk of the effort):** real firebase-admin token verification, durable per-uid quota, StoreKit 2 + Stripe billing, abuse controls, deploy, and wiring `streamViaProxy` into the chat send path. Stays `[~]` — the revenue feature is not shipped.
- **Impact:** High for revenue — removes the BYOK onboarding cliff (the single biggest funnel killer) and is the long-term fix for client-side key exposure. Depends on items 2 and 4.
- **Effort:** High (first server-side component: proxy, rate limiting, per-user quotas, subscription billing).
- **Scope:** Server proxy for Gemini/OpenRouter with per-user quotas; free bundled allowance on a cheap model; Pro subscription (~$8/mo) via App Store + web checkout.

### 9. [~] Custom user-defined lenses
> **Status note (2026-06-12):** Foundation + two new built-ins shipped on `feature/custom-lenses`. (a) Two new signature-quality lenses **Steelman** (best honest case FOR — the inverse of Challenge) and **Evidence** (the actual evidence base, weighted by quality) added to `TEMPLATE_SYSTEM_PROMPTS`. (b) `src/lib/customLenses.ts` — persisted CRUD store for user lenses (name/color/system prompt), `resolveLensPrompt()` (custom wins → built-in → undefined) and `lensMeta()` (label+color for any key), with built-in lens metadata table. (c) Message-stream system-prompt resolution now routes through `resolveLensPrompt`, so custom lenses + the new built-ins actually drive completions. 6 tests (id collision-safety vs built-ins + duplicates, update/delete, prompt resolution, meta fallback) green; tsc + build clean. **Remaining:** the lens-editor UI sheet and surfacing custom/new lenses in the in-panel "View as" switcher + pushed-tag styling — that touches the `'simplify'|'research'|'connect'|'challenge'` union across ~10 files and the per-lens thread registry, a larger slice. Likely gated behind Pro (item 8) at launch.
- **Impact:** Medium-high — flagship Pro differentiator; deepens the product's strongest identity (the lens system). `TEMPLATE_SYSTEM_PROMPTS` in `src/lib/driftPanel.ts`, lens colors, and the per-lens thread registry are already structured generically.
- **Effort:** Medium.
- **Scope:** Lens editor (name, color, system prompt) persisted to settings; render custom lenses in the switcher and pushed-tag styling; ship two new built-ins to the same honesty bar (Steelman, Evidence/sources).

### 10. [~] Polish backlog
> **Status note (2026-06-12):** Code-block copy button shipped on `feature/polish-codeblock-copy` — `src/components/CodeBlock.tsx` (hover-revealed Copy → "Copied" with haptic), wired as the `pre` override in all four markdown renderers (main chat both branches, DriftPanel, DriftMessageBubble). Render test green; also fixed vitest `include` to pick up `.test.tsx`. tsc + build + suite (9) green. **Remaining (not started):** message-list virtualization + `React.memo`/`useCallback` pass, and message editing/regeneration — larger, separate slices.
- **Impact:** Medium, cumulative.
- **Effort:** Low per item.
- **Scope:**
  - Message-list virtualization + `React.memo`/`useCallback` pass (long chats currently mount every DOM node).
  - Message editing and regeneration (roadmap items, not implemented).
  - Code-block copy button.
  - Exponential backoff on 429s; stop silently swallowing localStorage-quota and embedding-backfill errors.

---

## Suggested order of execution
1 → 4 → 3 → 2 → 5 → 6 → 7 → 9 → 8 → 10
(1 first because it's the cheapest insurance against the worst outcome; 4 early so everything after lands with a safety net; 3 and 2 interleave with owner actions; 8 last because it depends on 2 and 4 and is the largest build.)
