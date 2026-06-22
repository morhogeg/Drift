# Drift — Master Task List (Single Source of Truth)

**Consolidated:** June 22, 2026 · **Re-prioritized web-first:** June 22, 2026.
**Focus:** the **web app** (live on Vercel — https://drift-one-jade.vercel.app, BYOK, no key in bundle, auto-deploys on push to `main`). **iOS/native is parked** — see §P-iOS at the bottom; don't work it until web is solid.

> Single source of truth for all open tasks + future ideas. Add new tasks here. The old scattered docs (`ACTION_PLAN.md`, `BACKEND_HARDENING.md`, `HANDOFF.md`, `CLOUD_ACCOUNTS_HANDOFF.md`, `design-pink-first-todo.md`, `docs/plans/ai-review-crew.md`, etc.) are kept only as implementation-detail references (Appendix). `WORKING_NOTES.md` + `DRIFT_STATUS.md` are stale/superseded.

**Status:** `[ ]` not started · `[~]` in progress (often code-done on an unmerged branch) · `[x]` done · 👤 owner-only · 📄 see referenced doc.

**Ordering principle (web launch):** the web app is already public, so "launch" = make it *solid, safe, and worth sharing*, in this order — (P0) don't lose data / don't burn users / don't leak → (P1) finish the core experience already built → (P2) growth, retention & revenue → (P3) polish → debt. Work top-down.

---

## P0 — Launch-blocking for web (stability · security · data safety)

The three things that can actively hurt a web user or the product today.

1. `[~]` **Persist in-flight drifts + durable storage** — on web, a tab close or browser storage eviction silently destroys unsaved drift conversations (they live only in an in-memory `Map`). For a product whose value IS the accumulated exploration graph, this is the worst churn event. Code is **done but NOT pushed** (drift-db v3 `drift-temp-drifts`, write-through + `hydrateTempConversations()`, `navigator.storage.persist()`, 4 tests green). → **Push/merge it**, verify on web (start a drift → send messages → close tab without saving → reopen → restores intact), then close. 📄 `ACTION_PLAN.md` #1
2. `[ ]` **Connection-check polling backoff** ⚠️ — `src/hooks/useConnectionStatus.ts:57` pings the provider every 5s with no backoff; a user with an invalid or rate-limited (free-tier) key hammers Gemini/OpenRouter indefinitely and can get their account rate-limited/locked. Hits **every web user**. → Exponential backoff (5s→10s→30s→cap a few min), reset on first success or key change, don't poll while the key is empty. Done when an invalid key produces ≤ a handful of requests/min and a corrected key reconnects promptly. 📄 `BACKEND_HARDENING.md` #1
3. `[ ]` 👤 **Rotate BOTH exposed Gemini API keys** — `AIzaSyAAQ4C79…` is committed in pushed `main` git history (permanent; if the GitHub repo is public, assume harvested) and `AIzaSyA5I7…` shipped inlined in older builds. Rotate in Google AI Studio, then restrict the new key to the Generative Language API. (CI gitleaks baselines the known leak so only NEW leaks surface.) 📄 `REFACTOR_HANDOFF.md`

---

## P1 — Complete the core web experience (merge what's already built)

Code-complete on unmerged branches; merging these finishes the intended web product. Each: merge → quick web smoke. ⚠️ Several were built on `feature/apple-level-overhaul` / Fable branches before recent `main` changes — rebase/verify against current `main` first.

- `[~]` **Lens-state persistence** (`feature/lens-state-persistence`, stacked on `feature/persist-temp-drifts` — merge in that order; both bump drift-db) — Connect cards/answers move from App.tsx refs into `driftStore` backed by a v4 `drift-lens-state` IDB store, so **lens threads survive a web reload** (today a refresh loses them — a documented gap). 3 tests, suite green. 📄 `ACTION_PLAN.md` #5
- `[ ]` **CI + secret scanning — confirm live** — `.github/workflows/ci.yml` (tsc + vitest + vite build blocking, eslint advisory), gitleaks full-history scan with `.gitleaks.toml` baseline, dependabot. **Remaining:** confirm green on the first real PR; 👤 owner enables GitHub push-protection / secret-scanning in repo settings. Protects every change below it. 📄 `ACTION_PLAN.md` #4
- `[~]` **Security hardening — web parts** (`feature/security-hardening`) — (a) build-time **CSP** via Vite plugin (Playwright shows zero violations); (b) periodic **sanitized auto-backup** (`src/services/autoBackup.ts`, 6-hourly, ≤4 MB, no keys). Merge the web-relevant parts. *(The iOS Keychain migration in this branch → §P-iOS.)* 📄 `ACTION_PLAN.md` #6
- `[ ]` **Reconcile / close PR #31** ("Onboarding wow + key-at-need") — duplicates the shipped free-examples demo (seeds a sample Rome exploration). Suggested: keep its `ApiKeyPrompt` "key-at-need" modal, drop the redundant seeded sample. (Also has 2 failing eslint majors.) 📄 `DRIFT_STATUS.md`, `HANDOFF` #178

---

## P2 — Growth, retention & revenue (web fast-follows)

Once the core is solid, these drive a web launch's success.

- `[~]` **Shareable read-only drift maps — static export** (`feature/drift-map-export`) — **the missing viral surface.** `src/services/driftMapExport.ts` builds a self-contained dark HTML page (zero JS/network, XSS-escaped) from a chat's drift tree, wired to a Share button in the map header. Drift maps are the most screenshot-worthy artifact, and zero-refetch restoration means a map is already a replayable, inference-free artifact. → Merge. **Next:** hosted shareable links (depends on cloud, below). 📄 `ACTION_PLAN.md` #7
- `[~]` **Custom user-defined lenses** (`feature/custom-lenses`) — flagship differentiator; deepens the lens system (the product's strongest identity). Foundation done: `src/lib/customLenses.ts` persisted CRUD + `resolveLensPrompt()`/`lensMeta()`; stream resolution routes through it. **Remaining:** the lens-editor UI sheet + surfacing custom lenses in the "View as" switcher + pushed-tag styling (touches the `'simplify'|'research'|'connect'|'challenge'` union across ~10 files + the per-lens thread registry). ⚠️ This branch ships a "Steelman" built-in, but `main` later renamed Challenge→"Second opinion" and **removed Steelman** (`HANDOFF` #177) — reconcile before merging. Likely gated behind Pro. 📄 `ACTION_PLAN.md` #9
- `[ ]` **Message editing + regeneration** — edit a sent user message, truncate after it, re-send through the existing stream pipeline (`updateMessage` already exists in chatStore). Keeps exploration continuous instead of forcing a new thread. (Note: `FABLE_LOG` reports a `fable/edit-regenerate` branch built this — verify before re-doing.) 📄 `HANDOFF`, `WORKING_NOTES`, `FABLE_QUEUE` #3
- `[ ]` **Cloud accounts — web** (retention loop + cross-device recovery; the prerequisite for any paid tier) — Apple sign-in via web popup; backs up chats/drifts/snippets/settings-minus-keys to Firestore. Code complete + merged into `feature/cloud-accounts-merge` (tsc/build/14 tests green, both acceptance scripts pass, rules audited). **Remaining for web:**
  - `[ ]` Merge `feature/cloud-accounts-merge` → `main` (feature stays inert until env is filled).
  - `[ ]` 👤 **Owner Firebase setup (web subset):** create Firebase project → add Web app → fill 6 `VITE_FIREBASE_*` in env; enable **Apple** sign-in; register an Apple **Services ID** for web (return URL `https://<project>.firebaseapp.com/__/auth/handler`); create Firestore DB → `firebase deploy --only firestore:rules`. *(GoogleService-Info.plist + Xcode capability are iOS-only → §P-iOS.)*
  - `[ ]` Real-flow web test: sign in → push → wipe browser profile → sign in → pull restores everything except API keys; a local change auto-pushes within ~5s.
  - **Cloud-path backend hardening (must land before cloud goes live, not before a cloud-off launch):** 📄 `BACKEND_HARDENING.md` #2–5
    - `[ ]` Validate restored backup payload (`cloudSync.ts pullBackup()` ~L116) — bound array/nesting, validate shape, reject malformed/huge payloads (crash/DoS).
    - `[ ]` Cloud-sync timeouts (`pushBackup()` ~L67 / `pullBackup()` ~L116) — `AbortController` 30–60s, surface retriable error.
    - `[ ]` Clear in-memory key cache on logout (`auth.ts:71 signOut()` doesn't zero `secureKeys`).
    - `[ ]` Warn on merge-restore overwrite (`backup.ts` `mode:'merge'` can silently overwrite a newer local snippet).
  - `[ ]` Later: sync status outside Settings; conflict UX beyond last-write-wins; Google/email providers; chunked backups > ~950 KB.
  - 📄 `CLOUD_ACCOUNTS_HANDOFF.md`, `ACTION_PLAN.md` #2
- `[ ]` **Managed-key proxy + Pro tier** (revenue; removes the BYOK onboarding cliff — the single biggest web funnel killer — and is the long-term fix for client-side key exposure; depends on cloud + CI) — contract + reference only on `feature/managed-proxy-design` (`server/proxy.mjs` reference proxy w/ uniform SSE, `src/services/proxyClient.ts` inert unless `VITE_PROXY_URL` set, `docs/MANAGED_PROXY.md`). **Remaining (server/owner, the bulk):** real firebase-admin token verification, durable per-uid quota, Stripe **web checkout** (+ StoreKit later for iOS), abuse controls, deploy, wire `streamViaProxy` into the send path. Free bundled allowance on a cheap model + ~$8/mo Pro. 📄 `ACTION_PLAN.md` #8, `docs/MANAGED_PROXY.md`

---

## P3 — Polish & smaller features (web)

- `[ ]` **"Pink-First" accent overhaul** — flip violet→pink as the primary CTA/interactive accent across ~10 files (keep violet for drift-depth/hierarchy: knowledge tree, sidebar "source" labels, synthesis card, promote-arrive glow). Full per-file/per-line plan + palette in 📄 `design-pink-first-todo.md`; preview at `design-preview.html`. ⚠️ STALE bit: it lists `MultiModelCarousel.tsx` and `AddModelSheet` multi-select — multi-model was removed (`MultiModelCarousel` deleted), so skip that file.
- `[ ]` **Message-list virtualization + `React.memo`/`useCallback` pass** — long chats mount every DOM node; matters most on web with long sessions. 📄 `ACTION_PLAN.md` #10
- `[ ]` **Exponential backoff on 429s** + stop silently swallowing localStorage-quota and embedding-backfill errors. 📄 `ACTION_PLAN.md` #10
- `[ ]` **Custom system prompts per chat** — per-chat persona/instruction; services already accept system messages.
- `[ ]` **(Optional) Native Anthropic + Gemini** — wire `api.anthropic.com` directly (CORS ok with `anthropic-dangerous-direct-browser-access`), making OpenAI/Grok-via-OpenRouter a hybrid. Works in-browser; left as-is by request. 📄 `HANDOFF` provider-architecture note
- `[ ]` **Voice output (TTS)** — read-back of AI responses.
- `[ ]` **Light theme color polish** — some hardcoded dark hex colors remain.

### Semantic / "Connect" intelligence (inline `// TODO(semantic)` seams)
- `[ ]` **Seed the Connect lens from semantic neighbors** — `src/hooks/useDriftMessageStream.ts:205`. (`FABLE_LOG` reports `fable/connect-seeding` built this — verify.)
- `[ ]` **Draw semantic edges on the Drift Map** — `src/components/DriftKnowledgeGraph.tsx:233`. (`FABLE_LOG` reports `fable/map-semantic-edges` built this — verify.)
- `[ ]` **Persist composite `{id}__connect` lens-thread connect-state** to `driftInfos` — currently in-memory only (survives session, not reload).

---

## Tech debt & cleanup

- `[ ]` **App.tsx render-tree decomposition (Tier C)** — App.tsx ~3.5k lines / 35 `useState` / 16 refs; `DriftPanel` takes 25 props. Logic extraction (Tier B) is **done** (6 hooks; DriftPanel 1916→1199). What's left is the render tree: extract MessageList, Sidebar, Composer, Welcome/empty-state — slice-by-slice, rollback-safe commits via `/continue-refactor`. 📄 `ACTION_PLAN.md` #5, `REFACTOR_HANDOFF.md`
- `[ ]` **Add store-level vitest coverage** (chatStore, driftStore mutations) as slices land.
- `[ ]` **Dead code removal** — `DriftMapPanel.tsx` (graph replaced it); `onOpenRelatedDrift` prop unused in DriftPanel; `buildForest`/forest "All explorations" path dormant (scope fixed to `'chat'`) — remove if the global map isn't returning. 📄 `HANDOFF`
- `[ ]` **Drop noisy console.logs** — `[BUTTON-CLICK …]` / `[DRIFT-PANEL …]` in `useDriftPanelActions.ts` (`handlePushToMain`). 📄 `REFACTOR_HANDOFF.md`
- `[ ]` **Split `handleStartDrift`** (in `useDriftActions`, ~200 lines, 3 branches) into smaller private helpers. 📄 `REFACTOR_HANDOFF.md`

---

## Tooling: AI review crew (approved plan, not built)

`[ ]` **Build the role-based AI review crew + `/work-the-list` skill** — QA Tester (Playwright MCP + scripted smoke), Product Manager (aggregator → one prioritized checklist), Code Reviewer, Design/UX Reviewer; orchestrated by `/review-feature` writing `.claude/reports/<date>-<slug>/{qa,design,code-review,summary}.md`; `/work-the-list` fixes items off the latest summary. Needs `@playwright/test` + `playwright.config.ts` + `e2e/smoke.spec.ts` (adapt the `.fable/*.mjs` recipe, port 5199) + `.mcp.json` Playwright registration. Web-focused (covers app logic), so it fits the current scope. Full spec in 📄 `docs/plans/ai-review-crew.md`. To build: _"Implement the plan in `docs/plans/ai-review-crew.md`."_

---

## Future ideas (unscheduled — capture only)

- Map **focus mode**: select a card → trace its full ancestry + resonance edges together.
- **Jump-across-resonance-edge** on the map (tap a semantic edge to hop to the other drift).
- **Double-click-to-drift** gesture sugar (risk: selection conflicts).
- Embedding-based **semantic recall** for chips/highlights once a confidence affordance exists (current recall is exact-match only).
- Per-drift **"synthesis so far"** pinned card.
- Localize lens/map/chip chrome as **one unit** (map legend, bridge labels, etc.).
- **Folder / workspace organization** for chats.
- **Calendar / heatmap snippet view** (type defined, no UI).
- **Toast notifications** for errors/success.
- **Keyboard-shortcuts expansion.**
- **Drift timeline / history per message.**
- Richer Drift-Map empty state; show more lineage chain on the card; LOD tuning.

---

## 🍎 P-iOS — Parked: iOS / native (out of scope until web is solid)

Not dropped — explicitly deferred. Pick these up when returning to the native app. The `/xcode` skill still handles the build/sync/archive flow.

- `[ ]` Wire `PrivacyInfo.xcprivacy` into the Xcode target's "Copy Bundle Resources" phase; verify required-reason APIs vs SDKs.
- `[ ]` 👤 Archive + upload **TestFlight build 61** (Xcode `ios/App/App.xcworkspace` → Archive → Distribute → TestFlight).
- `[ ]` 👤 App Store Connect: app record for `com.morhogeg.drift`; age-rating questionnaire (open-ended AI → expect 17+/18+); App Privacy "nutrition label" matching the manifest.
- `[ ]` 👤 **Screenshots** — 5 dark shots exist via `scripts/shots.mjs` + `scripts/frame.mjs` (1290×2796). Open: merge shots 2&3, add a different 5th; render 6.9" (1320×2868)? Theme = DARK. *(Could be repurposed for web marketing/OG images even while iOS is parked.)* 📄 `APP_STORE_METADATA.md`
- `[ ]` **iOS Keychain migration** (part of `feature/security-hardening`) — move API keys from localStorage to Keychain via `capacitor-secure-storage-plugin` + one-time migration; web stays on localStorage. Verify keys absent from WKWebView localStorage on device.
- `[ ]` 👤 **Cloud — iOS-only setup** — `GoogleService-Info.plist` into `ios/App/App/` → `npx cap sync ios`; Xcode add **Sign in with Apple** capability. ⚠️ Don't `cap sync`+build iOS from the cloud branches before the plist exists (auth pod can crash at launch).
- `[ ]` 👤 **Full on-device verification pass** (all waves) — welcome screen no-scroll + tooltips; cloud sign-in/backup/restore; UI polish (arc label, single blank chat, no reopen chip); drift kill-and-restore; security (keys not in WKWebView localStorage, CSP, auto-backup); mobile UX (model picker in sidebar, lens-drift push + glow, header crowding, keyboard lift, touch targets, safe-area, RTL); providers/settings; Hebrew/RTL content; prior-session regressions. 📄 `HANDOFF` "What's Pending"

---

## 🚫 Deferred / not doing (with why)

- **Multi-model broadcast / continue-with-model** — removed by design (Jun 5, 2026); single-model only. Type fields + length-1 `selectedTargets` remain so it's trivial to revive. Off-limits unless explicitly revived.
- **Gemini key client-side exposure** — known; real fix is the managed-key proxy (P2). Deferred for now (BYOK mitigates; nothing ships in the web bundle).
- **Real auth as a standalone item** — superseded by cloud accounts (P2).
- **Hand-written drift-scaffold translation bundles** (es/ru/ar/it/ja) — reverted; EN/HE only (AI content already localizes via `languageDirective`).
- **Generic theming/perf chores with no exploration leverage** — out of scope for autonomous runs.

---

## Appendix — source documents (now references, not trackers)

| Doc | Keep as | Why |
|---|---|---|
| `ACTION_PLAN.md` | reference | Impact/effort rationale per item; folded into P0–P3 + debt. |
| `BACKEND_HARDENING.md` | reference | File:line detail for the 5 backend items. |
| `CLOUD_ACCOUNTS_HANDOFF.md` | **keep** | Deep cloud implementation handoff (branch stack, files-by-phase, gotchas). |
| `docs/plans/ai-review-crew.md` | **keep** | Full build spec for the review crew (binding verification + seeded-bug test). |
| `design-pink-first-todo.md` | **keep** | Per-file/per-line plan for the pink overhaul. |
| `APP_STORE_METADATA.md` | **keep** | Listing copy (reusable for web marketing too). |
| `HANDOFF.md` | reference | Chronological session log (historical record). |
| `DRIFT_STATUS.md` | reference/retire | Quick status read by `/drift`; superseded by this header. |
| `REFACTOR_HANDOFF.md` | reference | Refactor methodology + remaining polish; Tier B done. |
| `FABLE_QUEUE.md` / `FABLE_LOG.md` | reference/archive | Autonomous-run queue + log; branches reportedly built but **not merged** — verify against `main`. |
| `WORKING_NOTES.md` | **retire** | Mar 2026, largely stale (describes removed multi-model broadcast). Unique open ideas pulled into Future ideas. |

**Open offer:** I can still (a) retire `WORKING_NOTES.md` / `DRIFT_STATUS.md`, (b) add a "→ see TASKS.md" banner to the top of each superseded doc, or (c) move retired ones into `docs/archive/`. All source files are untouched so far.
