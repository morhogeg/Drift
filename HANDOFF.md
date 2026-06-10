# Drift — Session Handoff

**Date:** June 11, 2026
**Branch:** `main` (today's work committed + pushed to main; `feature/cloud-*` branches still unmerged, awaiting PR)
**Build:** 59 (iOS Xcode) / web
**Status:** This session (Jun 11, entry 175): **Launch prep — Arabic RTL + centralized language detection, prod API-key-leak fix, App Store metadata + 5 dark screenshots** (full detail in section 175 below; open screenshot decisions listed there). Prior session (Jun 10, entry 174): **Cloud accounts + UI polish** — (1) Cloud accounts implementation (Phase 1–3 complete): `src/lib/cloudConfig.ts` master gate, `src/services/firebase.ts` lazy init, `src/services/auth.ts` Apple sign-in (native iOS + web popup), `src/services/cloudSync.ts` backup/restore with 5s debounce, `src/services/cloudKeyStrip.ts` pure key-removal module + 6 vitest tests (zero keys in uploads guaranteed), `src/services/cloudHooks.ts` change-bus, `src/store/authStore.ts` Zustand, `src/components/account/SignInSheet.tsx` + `AccountSection.tsx` glassmorphic UI with EASE_OUT_EXPO animations, settings integration. Dynamic imports ensure Firebase code never fetches when disabled. Playwright verified: blank env ⇒ no Account UI, no Firebase init; env-filled ⇒ Account renders on-brand. `package.json` Firebase 12.x + @capacitor-firebase/authentication 8.3, vitest devDep. Three feature branches ready for PR: `feature/cloud-auth`, `feature/cloud-sync`, `feature/cloud-ui` (consolidates into `feature/cloud-accounts`). Owner setup checklist in HANDOFF.md. (2) UI polish fixes: arc label "related by field" → "related" (two places: legend + hover tooltip in DriftKnowledgeGraph); removed header "reopen last drift" chip block (38 lines deleted from App.tsx); fixed sidebar blank-chat dedup (demo-trim + load-time pruning + createChat guard). (3) Build: tsc clean, production build 298.45 kB JS / 125.54 kB CSS (gzip 86.48 / 18.60 kB), cap sync clean, build 58→59. All code committed + pushed to `fix/sidebar-map-chip-polish`. Next: open 3 cloud PRs (pending `gh auth login`), owner Firebase setup, TestFlight build. Prior session (Jun 9 continued, entry 173): **Model-name label removed**. Prior (Jun 9 continued, entry 172): **Language fix + highlights polish + map lens colors**.

## ⚠️ Provider architecture (important context for next session)
- **Why OpenAI & Grok route through OpenRouter, not native keys:** they block direct browser/webview calls (no CORS). `CapacitorHttp` can't rescue this — it doesn't support SSE streaming (falls back to webview → CORS again). So a pure client app **cannot** stream from OpenAI/Grok with native keys. Anthropic & Gemini *can* go native (they allow CORS; Anthropic needs header `anthropic-dangerous-direct-browser-access: true`). Current choice: **all four presented as brands, OpenAI/Anthropic/Grok routed via OpenRouter (one `sk-or-…` key), Gemini native.** Open future options: hybrid (native Anthropic+Gemini) or +proxy backend (native all 4). User chose to leave as-is for now.
- Branded labs are stored as `provider: 'openrouter'` presets with model ids `openai/* · anthropic/* · x-ai/*`; the live OpenRouter catalog is filtered by that prefix so line-ups never go stale. No dispatch changes — existing OpenRouter streaming path runs them.

---

## What Was Done This Session

### 175. Launch prep — i18n/RTL, prod key-leak fix, App Store assets (Jun 11)

All work below committed + pushed to `main` (`28ec93b` RTL/lang, `ca9fb63` launch prep, `23e7432` + `e7538b8` screenshots).

**Arabic RTL + centralized language detection** (`28ec93b`):
- `src/utils/rtl.ts` — direction detection broadened from Hebrew-only to Hebrew **+ Arabic** (base + presentation-form ranges). New name `detectRTL`; `detectHebrew` kept as a back-compat alias. Fixes Arabic AI content rendering LTR.
- `src/lib/lang.ts` (NEW) — single source of truth for language detection: `detectLangCode()` (script + Latin-stopword) + `langDisplayName()`.
- `src/services/gemini.ts` — `detectLanguage()` now delegates to lang.ts; LLM `languageDirective()` output unchanged (behavior-preserving refactor).
- DECISION: considered es/ru/ar/it/ja drift-scaffolding translation bundles in `src/lib/driftPanel.ts`; user chose to **revert and keep EN/HE only** (AI content already localizes via languageDirective; hand-written translations carry verification risk). driftPanel.ts unchanged from main.

**Prod API-key-leak fix** (`ca9fb63`):
- Vite inlines `import.meta.env.VITE_GEMINI_API_KEY` at build time, so a populated `.env` baked the dev key into release bundles (default at `settingsStorage.ts:11`). Fixed: personal key moved to `.env.development.local` (gitignored, dev-only), `.env` emptied, `.env.production` committed pinning keys empty, `.env.example` refreshed. **Verified:** `npm run build` bundle has no key; `vite build --mode development` still embeds it. Production = BYOK.

**App Store assets** (`ca9fb63`, `23e7432`, `e7538b8`):
- `APP_STORE_METADATA.md` — name/subtitle/promo/keywords/description/what's-new + checklist of ASC-only fields.
- `PRIVACY_POLICY.md` — hostable (GitHub Pages) privacy policy.
- `ios/App/App/PrivacyInfo.xcprivacy` — **BASELINE** manifest. ⚠️ must be ADDED TO THE XCODE TARGET to take effect; verify required-reason APIs vs SDKs.
- Screenshot pipeline: `scripts/shots.mjs` seeds a "Why do we dream?" demo (root + 9 drifts, 2 levels) into IndexedDB and captures the real UI at 1290×2796 (6.7"); `scripts/frame.mjs` frames each on the brand gradient with a headline. Output in `screenshots/final/` (raw/ gitignored). Re-run: `npm run dev`, then `node scripts/shots.mjs <port>`, then `node scripts/frame.mjs`.
- 5 **dark** shots: `1-main`, `2-suggest` (tap Drift → real AI "Try asking" suggestions), `3-lenses` (free-form Drift + 4 lenses), `4-map` (branched tree, zoomed to fit), `5-synthesis` (✦ Synthesis summary). Suggestions in shot 2 are real AI output (Gemini API reachable from dev env).

**OPEN DECISIONS for next session (user to discuss):**
1. Shots 2 & 3 share the drift-panel header (lens bar) — decide whether to merge into one and add a different 5th (e.g. Connect constellation / push-to-main).
2. Whether to also render the **6.9"** size (1320×2868) for the latest Pro Max.
3. Theme already decided: **DARK** (matches design system; light mode rejected).

**Still blocking launch (unchanged):** add PrivacyInfo.xcprivacy to Xcode target; age-rating questionnaire; confirm/create ASC app record; on-device pass; owner Firebase setup; open the 3 cloud PRs.

### 174. Cloud accounts + UI polish (FEATURE/FIX, Jun 10)

**Cloud accounts (Phase 1–3 complete):**
- `src/lib/cloudConfig.ts` — Master gate `isCloudEnabled()` checking all 6 VITE_FIREBASE_* env vars (inert if blank).
- `src/services/firebase.ts` — Lazy dynamic-import singleton (app, auth, db) initialized only when `isCloudEnabled()` is true.
- `src/services/auth.ts` — `signInWithApple()` (native sheet on iOS via @capacitor-firebase/authentication, popup on web), `signOut()`, `onAuthChange(cb)` returning unsubscribe, `getCurrentUser()`. Normalized `CloudUser {uid, displayName, email}`.
- `src/services/cloudSync.ts` — `pushBackup()` calls `buildBackup()` → `stripApiKeysDeep()` → `assertNoApiKeys()` → `setDoc(users/{uid}/backup/current)` with `serverTimestamp()`. `pullBackup()` reads → `restoreBackup(merge)` with `suppressAutoPush` flag. Debounced 5s auto-push with in-flight coalescing.
- `src/services/cloudKeyStrip.ts` — Pure module: `stripApiKeysDeep<T>(value)` removes any field matching `/apikey/i` at any depth, `findApiKeyFields(value, path)` returns dotted leak paths, `assertNoApiKeys(value)` throws if any remain. **6 vitest tests** prove: strips top-level/preset/nested keys, case-insensitive, preserves non-secret data, no input mutation, exact leak detection, assert throws on dirty/passes on clean.
- `src/services/cloudHooks.ts` — Dependency-free change-bus: `onLocalDataChange(cb)` returns unsubscribe, `emitLocalDataChange()` notifies listeners (no-op when no subscribers).
- `src/store/authStore.ts` — Zustand: `user`, `status`, `authError` + sync-status fields (`syncStatus`, `lastSyncedAt`, `syncError`).
- `src/components/account/SignInSheet.tsx` — Glassmorphic bottom sheet, framer-motion EASE_OUT_EXPO entrance, glowing violet/pink orb, Apple brand SVG button, pitch copy.
- `src/components/account/AccountSection.tsx` — "Account" section in Settings (above Models). Signed out: pitch + Sign in. Signed in: gradient avatar, identity, sync-status indicator (amber pulse syncing / emerald synced + relative time / red error), Back up now / Restore / Sign out buttons.
- `src/components/Settings.tsx` — 3-line edit: lazy import AccountSection, gated render with `isCloudEnabled()`.
- `src/main.tsx` — Guarded dynamic import: `if (isCloudEnabled()) initCloudSync()` (auto-push + auth listeners).
- `src/services/db.ts` — 3 `emitLocalDataChange()` calls after chatDB.put/delete/clear.
- `.env.example` — Placeholders for 6 VITE_FIREBASE_* vars.
- `firestore.rules` — Deny cross-user access; `match /users/{uid}/{document=**}` allow read/write if `auth.uid == uid`.
- `scripts/verify-cloud-disabled.mjs` — Playwright proof: blank env ⇒ no Account UI, no Firebase init, no cloud requests.
- `scripts/verify-cloud-enabled.mjs` — Smoke test: env-filled build ⇒ Account section + sign-in sheet render on-brand.
- `CLOUD_ACCOUNTS_HANDOFF.md` — Full handoff: branch stack, files-by-phase, verification status, owner setup checklist.
- `package.json` — Firebase 12.x, @capacitor-firebase/authentication 8.3, vitest devDep; test script.
- **Three feature branches ready for PR:** `feature/cloud-auth`, `feature/cloud-sync`, `feature/cloud-ui` (consolidates into `feature/cloud-accounts`). Awaiting `gh auth login` to open PRs.

**UI polish fixes:**
- DriftKnowledgeGraph.tsx: arc tooltip label "related by field" → "related" (legend line ~1153, hover chip ~1175).
- App.tsx: deleted "reopen last drift" chip block (lines 1976–1989), removed `reopenLastDrift` from destructure (line 1378).
- chatStore.ts: new helper `isBlankChat(c)` dedupes blank chats. In `loadChatsFromDB()` added pruning logic. In `createChat()` added guard: if blank exists, switch to it instead of stacking another.

**Verification:** Playwright smoke tests pass (cloud disabled/enabled states correct). All chats built clean. Bundle size 298.45 kB JS / 125.54 kB CSS (gzip 86.48 / 18.60 kB). tsc + vite clean, cap sync synced, build 58→59.

### 171. Synthesis made honest + navigable (QUALITY/FEATURE, Jun 9)

**Goal:** make synthesis genuinely useful, not a gimmick — never force a connection that isn't there — and let the user jump back into the source drifts it was woven from.

**Adaptive synthesis prompt (`src/services/gemini.ts` `synthesizeDrifts`):**
- Reframed from "the synthesizing intelligence … weave into ONE cohesive synthesis" (which forced a unifying thesis) to "the reflecting intelligence … NEVER manufacture a unifying idea that isn't really there — a forced connection is worse than no connection."
- The model now **assesses relatedness first**, then picks a mode:
  - **SYNTHESIS** (real through-line exists): bold takeaway naming the through-line + connective tissue between branches.
  - **TRAIL** (mostly independent tangents): bold sentence describing the SHAPE of the exploration + one honest line per branch on what it gave you + genuine links ONLY if they exist (else says so plainly).
  - **Partial** allowed: synthesize the branches that connect, list the rest standalone.
- Added "Don't pad. If there's little to say, say little — usefulness over length." (kills the ~350-word filler floor). Kept the "**Next:**" parsed open question + `LANGUAGE_DIRECTIVE`.
- Temperature **0.8 → 0.55** — high temp nudges toward flowery, manufactured connections.

**Wording cleanup — "Bring it home" → "Synthesize" (app-wide):**
- `src/App.tsx`: resume-card button "✦ Bring it home" → "✦ Synthesize N drifts" (now shows `t.driftCount`, matching the map bar). Comments updated.
- `src/components/DriftKnowledgeGraph.tsx`, `src/components/SidebarChatRow.tsx`, `src/index.css`, `src/services/gemini.ts`: stray "bring it home" in comments/docstrings/CSS replaced with "synthesis". No "bring it home" remains.

**Synthesis source chips → open the existing drift in the side panel (no API call):**
- Extracted the Drift Map's inline `onOpenDrift` handler (~85 lines) into a reusable **`openExistingDrift(driftChat: ChatSession)`** in `src/App.tsx`. Restores already-generated content with zero new LLM call — handles regular drifts (replays messages), Connect lists (rebuilds chips from cached cards), and Connect bridges (reopens the Q&A thread). The map now just passes `onOpenDrift={openExistingDrift}`.
- The synthesis chips (`isSynthesis` block) now look the drift up by `chatId` in `chatHistory` and call `openExistingDrift` — tapping a chip slides open the panel showing what was already explored (was `switchChat`, which opened it as a full chat). Falls back to `switchChat` only if not found.

**Chips deduped by term:** applying several lenses (Simplify/Deep dive/Connect/Challenge) to one term spawns separate drift chats, which repeated the chip. `synthSources` now dedupes by `term.toLowerCase()` (one chip per concept); the user switches lenses inside the panel. The "woven from N drifts" count still reflects all N explorations.

**"View as" lens bar marks already-explored lenses (`src/App.tsx` + `src/components/DriftPanel.tsx`):**
- **Problem:** opening a chip lands on one lens, but the user had no way to see which OTHER lenses already had content (explored pre-synthesis) vs. which were empty — forcing blind taps that waste time and AI tokens.
- New `exploredLenses` memo in App.tsx computes, for the open term+source, the set of lens keys that have **actual content** — content-verified (a registry entry alone can be a navigated-but-empty thread), so each candidate `driftChatId` is checked for a non-empty conversation (temp store / chatHistory) or cached Connect cards/answers. Survives reload: scans persisted drift chats by `(sourceMessageId, selectedText)` and infers each one's lens from its `__lens` id suffix (the first lens is recorded on the source message's driftInfo); plus marks Connect from `driftInfo.connectCards/Answers`.
- DriftPanel takes a new `exploredLenses?: Set<string>` prop; the bar renders a small signature-hue dot + brighter label on each explored-but-inactive lens (the active lens is already filled). Title tooltip "{lens} — already explored".

### 170. Mobile UX overhaul: model picker relocation + lens-drift push + header/footer fixes + audit (MAJOR MOBILE, Jun 8)

**Goal:** fix four core mobile UX issues + deploy 12 audit fixes + optimize bundle size.

**Core Task 1 — Model picker moved to sidebar:**
- **src/components/ModelPillRow.tsx** — deleted (no longer used on mobile)
- **src/App.tsx** sidebar footer (lines 1503–1542) — redesigned from 4 stacked rows into compact icon toolbar: Model pill stays labeled (flex-grows for readability), Gallery/Help/Settings are 40px icon-only buttons. Gallery + Help hidden on desktop (`lg:hidden`). Kept Settings visible everywhere.
- **Result:** mobile sidebar footer compact, desktop sidebar still clean.

**Core Task 2 — Lens-drift push fixed:**
- **Problem:** Push button didn't work for drifts opened via lens templates (Simplify/Connect/etc.). Pushed text had no clear indication it succeeded, and users couldn't see where it landed on return to main chat.
- **Solution (full pipeline threading):**
  - **useDriftPanelActions.ts**: added `templateType` param to `onPushToMain` callback + filter change `isDriftOpenerText` → `isDriftScaffoldText` to strip both opener AND template scaffold.
  - **useDriftActions.ts** (lines 475, 532–598): `handlePushDriftToMain` now accepts + threads `templateType` into driftPushMetadata (separator + each message). Removed 1.2s auto-clear timer; `justPromotedChatId` now persists until reveal effect clears it.
  - **src/types/chat.ts** (lines 38–47): added `templateType?: 'simplify'|'research'|'connect'|'challenge'` to Message['driftPushMetadata'].
  - **src/App.tsx** (lines 48–59, 2039, 2043–2044, 2060, 2178, 2181, 2235): added `PUSHED_LENS_TAG` mapping (templateType → label/colors/arrow), replaced hardcoded "Drift" tags with lens-aware rendering, passed `templateType` to three `handleStartDrift` reopen calls so reopening restores the same lens.
  - **Push indication (new):** DriftPanel (lines 677–698) shows in-panel "✓ Added to the main thread — View" confirmation bar with button that closes panel and scrolls to content.
  - **Reveal effect (new):** App.tsx (lines 318–337) — when main chat becomes visible (panel + map closed), auto-scrolls to promoted message, applies `.drift-landing` glow animation (2.6s sustained), clears `justPromotedChatId`. Added to index.css (lines 199–209) `@keyframes driftLandingGlow` with prefers-reduced-motion guard.

**Core Task 3 — Header crowding fixed:**
- **src/App.tsx** header (lines 1537): left-group `gap-4` → `gap-2` to give breadcrumb more room.
- **src/App.tsx** (lines 1537): right-group container `shrink-0` → `min-w-0` so reopen-drift pill can compress.
- **src/App.tsx** (lines 1696–1703): reopen-drift pill now `min-w-0`, `max-w-[28vw]`, added `shrink-0` to Map and + buttons.
- **Result:** search icon no longer overlaps breadcrumb/reopen-pill on narrow phones.

**Mobile Audit Fixes (Wave 1 — Agent A/B/C):**
1. **Keyboard lift fallback (visualViewport)** — src/hooks/useKeyboardVisibility.ts (lines 17–90): added `capacitorActive` guard flag, extracted scroll helper, implemented `setupVisualViewportFallback()` for PWA/web fallback when Capacitor unavailable. Handles web version + simulator without native Capacitor.
2. **Selection bar clipping** — src/components/SelectionTooltip.tsx (lines 551–578): split single pill into outer wrapper + inner scrollable row; changed template buttons from `flex-1` to `flex-shrink-0` so all buttons reachable via horizontal scroll on narrow phones (90+ template buttons now accessible).
3. **Selection bar overlapping composer** — src/App.tsx (lines 140, 1048–1058, 2641): added ResizeObserver to measure composer height, write to `--composer-h` CSS var. SelectionTooltip (line 543) changed fixed `bottom: 76px` to `calc(...+ var(--composer-h) + 16px)` so bar dynamically floats above multi-line input.

**Mobile Audit Fixes (Wave 2 — Agent D/E):**
4. **Sidebar safe-area** — src/App.tsx (line 1411): added `pt-safe` to sidebar header row, clearing status bar on notch phones.
5. **RTL truncation** — src/utils/rtl.ts (lines 15–20): new export `getRTLTruncateClassName` that returns only `'dir-rtl'` (drops forced `text-right`) so Hebrew truncated spans rely on `dir="rtl"` attribute for correct ellipsis placement. src/App.tsx (lines 20, 1710, 1756) switched header title + breadcrumb to use new function.
6. **Composer button touch targets** — src/App.tsx (lines 2713, 2724, 2735, 2748): added `min-w-[44px] min-h-[44px]` to mic/stop/send buttons (was ~36px).
7. **Lens chip touch targets** — src/components/DriftPanel.tsx (line 726): lens chips now `min-h-[44px]`.
8. **Sibling switcher touch targets** — src/components/DriftPanel.tsx (lines 757, 806): changed arrows to `min-w-[44px] min-h-[44px]`.
9. **Connect chips keyboard lift** — src/components/DriftPanel.tsx (line 817): changed `pb-32` to `style={{ paddingBottom: 'calc(8rem + var(--kb-h, 0px))' }}` so last chips clear lifted keyboard.
10. **Selection bar – unused Compare variable** — src/components/DriftPanel.tsx (line 185): changed `const [isComparing, setIsComparing]` → `const [, setIsComparing]` (setter still needed by hook, but unused state var).
11. **Selection bar scrollable template buttons** — src/components/SelectionTooltip.tsx (lines 551–557): added `flex-nowrap overflow-x-auto [&::-webkit-scrollbar]:hidden` to inner row, `scrollbarWidth: 'none'` for CSS.
12. **Mobile Gallery/Help in sidebar** — handled by footer redesign (above).

**Bundle optimization (Vite manualChunks):**
- **vite.config.ts**: added `build.rollupOptions.output.manualChunks` (function form):
  - `react-vendor` (React, ReactDOM, scheduler)
  - `markdown` (react-markdown, remark-*, rehype-*, react-syntax-highlighter)
  - `framer-motion` (Framer Motion)
  - `icons` (Lucide)
  - `state-vendor` (Zustand, idb)
- **Result:** main chunk 763 kB → 289 kB (gzip 233 kB → 83 kB), >500 kB warning eliminated. Vendor chunks are large but cacheable on repeat visits.

**TypeScript + Build:**
- Fixed one TS error post-build (unused `isComparing` var in DriftPanel).
- `npm run build` passes clean, `npx cap sync ios` synced web assets + plugins, build number incremented 54→55.

### 169. Highlight-menu redesign + unified color system + side-chat fixes (POLISH/BUG FIX, Jun 8)

**Goal:** make the selection highlight-menu coherent, fix two long-standing side-chat selection bugs, and unify the template colors across the tooltip, the lens bar, and the Connect page.

**Highlight menu / tooltip (`src/components/SelectionTooltip.tsx`):**
- **Unified icon set** — replaced the mismatched glyphs with a consistent Lucide set: Simplify `Lightbulb`, Deep dive `Telescope`, Connect `Waypoints`, Challenge `Scale` (was `Swords` — too aggressive). Dropped `BookOpen`/`Link2`/`Swords` imports.
- **Per-action signature colors** via an `ACTION_TINT` map (icon rest+hover, card hover border): Simplify=amber, Deep dive=blue, **Connect=`accent-discovery` cyan** (matches the Connections page), Challenge=rose. Replaced the earlier amber/sky two-group tint. A hairline divider still splits the menu into the understand (Simplify/Deep dive) and extend (Connect/Challenge) pairs.
- **Primary button relabeled** "Drift" → **"Drift into"** (desktop + mobile) to disambiguate for new users.
- **Save** tinted **violet** (moved off cyan to avoid clashing with Connect's cyan).

**Bug — pushed-drift text now selectable (`src/App.tsx`):** the pushed-drift bubble's `onClick` (jump-to-drift) fired on the click that ends a drag-selection, hijacking the selection so the tooltip never persisted. Guarded the handler to bail when `window.getSelection()` is non-collapsed — the same drift/save tooltip now works on pushed text.

**Bug — tooltip flicker in side chat (`SelectionTooltip.tsx`):** `handleMouseMove` dismissed purely on cursor geometry, so drifting a few px off the selection box scheduled a close ("needed 3–4 tries"). Now it keeps the tooltip open while a non-collapsed selection exists; it only closes on actual deselect / click-elsewhere.

**Sibling term strip — drag to scroll (`src/components/DriftPanel.tsx`):** the chips strip had `overflow-x-auto` but no drag affordance. Added pointer-based click-and-drag horizontal scrolling (`cursor-grab`→`grabbing`, pointer capture) with a `dragged` guard so a drag never accidentally switches drifts. The ‹ › chevrons still work.

**Connect page — legend removed (`DriftPanel.tsx`):** deleted the bottom color legend (History/Tension/Influence/Identity/Origin); each card already names its relationship in words + shows a tinted icon. Removed the now-unused `presentKinds` and `CONNECT_TYPES` import.

**Lens bar consistency (`DriftPanel.tsx`):** the "View as" bar hard-coded violet for every active lens. Now each active lens wears its signature color (`activeTint` map) — active Connect is cyan, mirroring the page below and the tooltip. Drift stays violet; warm hues use `-500` shades for light-mode legibility.

**Localization (`src/lib/driftPanel.ts` + `DriftPanel.tsx`):** the Connect "Tap a connection to explore the bridge between them." hint was hardcoded English. Added a language-aware `connectHint` to `DriftLabels` (EN + HE) and rendered it via the existing `driftLabels` memo.

### 168. Drag-to-resize columns + full-screen map (FEATURE, Jun 8)

**Goal:** let the user drag the sidebar, sidechat, and Drift Map narrower/wider (others adjust dynamically), and make the map able to fill the whole screen.

**Key insight (kept it small):** the main chat is already `flex-1` and reserves exactly the side-panel widths via `marginLeft`/`marginRight`, so it reflows for free. We only had to (1) drive those widths from state and (2) add drag handles that mutate the state. **No conversion to a flex/grid column model.** Sidechat and map still share the right slot (mutually exclusive), as before.

**Files:**
- **`src/components/ResizeHandle.tsx`** (new) — thin (`w-2.5`) vertical drag bar, `hidden lg:block`. Uses pointer capture; reports the pointer's viewport X via `onResize(clientX)` and lets the parent map that to a clamped width. Sets `body.userSelect='none'` + `cursor:col-resize` during drag. Violet hairline on hover/active. Props: `edge` ('left'|'right'), `onResize`, `onResizeStart/End`.
- **`src/App.tsx`** — owns in-session widths `sidebarWidth` (340), `driftWidth` (450), `mapWidth` (680) + a `resizing` flag that suppresses the main column / sidebar / panel width transitions mid-drag (otherwise they ease ~300ms behind the pointer). `mapExpanded` → `mapFullscreen`. Margins switched from hardcoded (`lg:ml-[340px]`, `min(450px,56vw)`, `mapPanelWidth`) to the live widths via `mainLeftMargin` / `mainRightMargin`. Sidebar `<aside>` gets inline width on `lg` (kept `w-[85vw]` for mobile, added `lg:max-w-none`) + a right-edge handle. Passes `width`/`onResize`/`onResizeStart`/`onResizeEnd` down to DriftPanel and DriftKnowledgeGraph.
- **`src/components/DriftPanel.tsx`** — new props `width`, `onResize`, `onResizeStart/End`, `resizing`. Outer wrapper drops the `lg:w-[450px]`/`70vw` classes for inline `style={{ width }}` (mobile passes `undefined` so `inset-0` still governs the full-screen sheet). Left-edge handle. Existing expand/collapse button now doubles as a width preset (collapse 450 ↔ expand ~62vw) via the existing `onExpandedChange`.
- **`src/components/DriftKnowledgeGraph.tsx`** — props renamed `expanded`→`fullscreen`, `onToggleExpand`→`onToggleFullscreen`; added `width`, `onResize`, `onResizeStart/End`. Desktop panel: `width: fullscreen ? '100vw' : width`, `left:0` when fullscreen (covers sidebar+chat; map `z-40` > sidebar `z-20`). Width CSS transition disabled while a local `isResizing` flag is set (drag). Expand button retitled "Full screen"/"Exit full screen". Left-edge handle, hidden in fullscreen. (Mobile `isMobile` sheet branch untouched.)

**MIN_MAIN floor (overlap fix):** the desktop header's right cluster is wide and `shrink-0` — Map pill (~93px) + New-chat (44px) + `HeaderControls` model picker + "Connected" chip (~260px) — plus the left icon cluster (~210px). Below ~650px chat width the right cluster overlaps the left icons. So a right panel may only grow until the chat would drop below **`MIN_MAIN = 660`** (`App.tsx`); this protection wins over the panel's own min (on a narrow window the panel yields, not the chat). It accounts for the open sidebar (`maxRightWidth()`). Also added `truncate max-w-[150px]` to the model-name label in **`HeaderControls.tsx`** so a long model name can't blow out the header. Tradeoff: with sidebar open on a 1280 screen the map drag tops out ~280px — close the sidebar (~620px) or use the fullscreen button for a large map. `MIN_MAIN` is a single constant, easy to tune.

### 167. Keyboard shortcuts + honest Login (FEATURE, Jun 7)
- **ShortcutsHelp.tsx** (new) — overlay modal on `?` key or header button. Shows keyboard shortcuts (⌘K search, ⌘⌥N new, ⌘⌥G map, ?) and feature tips (Drift, Lenses, Snippets, Map, Synthesize). Escape/click-outside closes, scrollable content, 460px width.
- **useKeyboardShortcuts.ts** — extended with `onToggleHelp` handler; `?` key ignored when typing in input/textarea/contentEditable.
- **Login.tsx** — removed fake password, dead social buttons, "Forgot password". Single optional name field, honest "Enter Drift →" button. Reassurance: "No account needed — your conversations stay on this device."
- Files: `ShortcutsHelp.tsx`, `useKeyboardShortcuts.ts`, `Login.tsx`, `App.tsx` (render ShortcutsHelp, add helpOpen state/handler).

### 166. Map + panel UX polish pass (POLISH, Jun 7)
- **Filter live-search** — fade-away animation (opacity 0 on hidden cards, pointerEvents none), 0.3s ease transition; matches auto-focus on single result.
- **Chip-tap pulse** — cards matching active chip get 1.1s dkgCardPulse ring on tap; added zoomBy helper (0.4x–2.4x clamps, zoom around canvas center).
- **RTL arrow direction** — dirArrow() helper detects Hebrew/Arabic script, returns '←' for RTL / '→' for LTR; applied to Connect bridges + breadcrumb separators.
- **Connect card light-mode** — changed surface from hardcoded rgba(26,26,26,0.4) to rgb(var(--color-elevated)); border from rgba(255,255,255,0.07) to rgb(var(--color-border)). Light-mode :root:not(.dark) overrides apply.
- **Detail card coverage** — reduced max-height 46% → 40%, preview clamp 5 → 3 lines; added smart re-fit when inspector opens/closes (toggled = selection changed).
- **Zoom button subtlety** — changed from rgba(255,255,255,0.035) bg to transparent at rest; faint bg (0.07) only on hover. Border 0.06 opacity, icon 0.4. Reduced 34px → 28px with tighter gap. Light mode: fit buttons transparent, search pill retains faint bg.
- **Chips tone-down** — removed glows/shadows; inactive chips: neutral text + hairline border + 6% hue whisper; active chip full hue. Reduced hover brightness filter.
- All changes verified with tsc + vite build. Bundle: main 757.81 kB / gzip 231.81 kB.

### 165. Drift Map redesign — "luminous cards" (Jun 7)

**Goal:** the Drift Map is the "record of a mind in motion." It was tiny orbs in a void with labels crammed around them, and Hebrew was garbled. Rebuilt it Apple/Notion-grade.

**Files:** `src/components/DriftKnowledgeGraph.tsx` (the bulk), `src/App.tsx` (panel width / margin / open-drift wiring), `src/index.css` (synthesis artifact), `src/lib/format.ts` (added shared `timeAgo`).

**Core architectural change — text is now native HTML, not SVG.**
- The root cause of garbled/reversed Hebrew was rendering labels as SVG `<text>` (no bidi support, no wrapping). Now every node is an **HTML card** in a layer that *shares the SVG pan/zoom transform* (`translate(view.x,view.y) scale(view.scale)`), so cards scale 1:1 with the map. This gives correct `dir="auto"` bidi + real wrapping AND keeps the non-overlap guarantee (everything scales uniformly). SVG is now used **only** for the connector "rivers" + gradients.

**Node = card (`.dkg-card`).** Anatomy, top→bottom:
- **Initiating-term pill** (`.dkg-card-term`) = `metadata.selectedText` — the highlighted text that spawned the drift (e.g. "ירושלים"). This is what makes each card self-identifying; hidden when redundant with the title.
- **Title** = `nodeTopic(chat, null)` (full question / "term → term" bridge), 3-line clamp.
- **Gist** = `nodeAnswerGist`/`cleanGist` — a clean *complete* first sentence (filler-stripped, declarative, capitalized for Latin), 2-line clamp.
- **Meta** = luminous depth-orb + "Origin/↗ Drift · N msgs · time".
- Depth encoded by `HUES` (violet→indigo→sky→cyan) via card glow/border/orb.

**Layout (`layoutTree`/`measureNode`):** left→right columns (depth = x), each card reserves a vertical band = its **bounded** height (lines estimated with deliberately-low chars-per-line so estimate ≥ actual wrap → bands never overlap). `COL=372`, card widths 252/276 (root). Narrow-deep reads as a long chain; wide as a tall fan. Hierarchy is correct because it follows `parentChatId` (nested-drift logic in `useDriftActions.ts` already sets the right parent).

**Connectors:** `ribbonPath`/`flowPath` rivers attach to card **edges** (parent right → child left), tapered + weighted by child message volume, with a subtle animated flow pulse.

**Atmosphere/motion:** removed drifting motes; calmer deep navy-violet gradient; staggered card-rise on open; hover-lift; selected ring; "alive" pulse on recently-touched cards; level-of-detail (title-only when `view.scale < 0.58`). All gated by `prefersReducedMotion`.

**Inspector (the tap target):** the old floating `DetailCard` overlapped the map. It's now a **docked bottom inspector** — the canvas shrinks to make room, so it never covers cards. Shows term pill + full title + lineage breadcrumb + generous preview + "Open this drift / Go to chat". Map starts with **no selection** (map is the hero on open).

**Panel expand + layout fixes (`App.tsx`):**
- Expand toggle (⤢/⤡ in the desktop header, `expanded`/`onToggleExpand` props) widens the panel `min(680px,56vw)` → `min(1040px,90vw)` (~+53%), smooth transition, map re-fits.
- The main column's right margin is now **dynamic** (`mainRightMargin`, gated to ≥1024px via `isLgUp`) and matches the actual open panel width — so the map (or expanded map) **never covers the chat** (old bug: fixed `mr-[480px]` vs 680px panel).
- **"Open this drift" fix:** navigating from the map now **closes the map** on desktop too (it used to open the drift *behind* the still-open map → looked like nothing happened).
- Canvas "recenter/fit" control icon changed to `Maximize` (frame) so it's distinct from the expand arrows (`Maximize2`/`Minimize2`).

**Synthesis artifact** (earlier in session): `.synthesis-card` in `index.css` + render in `App.tsx` — accent rule, ✦ eyebrow, "woven from N drifts" source chips, Explore-next CTA.

**Verified:** `npx tsc --noEmit -p tsconfig.app.json` clean; `npm run build` clean; ran `npm run dev` (served 200) and iterated live against a real Hebrew session.

**Open / next ideas for the map (where to continue):**
- The term pill relies on `metadata.selectedText`; very old drifts without it fall back to just the question. (New drifts always have it.)
- Consider: flip hierarchy so the **term is the headline** and question is secondary (user asked to consider).
- Possible: richer empty state in card language (currently still ghost orbs); show more of the lineage chain on the card; LOD tuning; mobile pass of the docked inspector.
- **Not committed yet** — review the diff, then commit on `feature/apple-level-overhaul` (use the `xcode` skill to build/sync/commit + bump build for TestFlight if desired).

### 164. Refactor completion + security audit (REFACTOR SUMMARY, build 52)
- **Tier B refactor complete:** All five `DriftPanel.tsx` decomposition slices extracted and verified (commits `00965d9` through `c99fb3d`). DriftPanel 1916→**1199 lines**. Behavior-preserving: every state movement + effect + handler shipped as-is; all five slices verified with tsc + vite build + Playwright smoke (mix of live Gemini and mocked SSE per slice). See `REFACTOR_HANDOFF.md` for detailed handoff + next optional polish.
- **Security audit findings — ACTION REQUIRED:** Two Gemini API keys exposed:
  1. **Key in git history** (`AIzaSyAAQ4C79…`): committed in pushed main (commit `0ff024e` + 3 later). Permanent — anyone who clones the repo can recover via `git log -S`. If repo is public, assume already harvested.
  2. **Key in `.env` inlined into bundle**: Vite's `VITE_`-prefixed vars inline into the built JS plaintext. Every TestFlight/web build ships the key.
- **User actions (not code — only the user can do this):**
  1. Rotate **both keys** in Google AI Studio (https://ai.studio).
  2. Raise/reset the Gemini **spend cap** (currently 429 RESOURCE_EXHAUSTED, blocking live AI). Raise cap at https://ai.studio/spend.
  3. Long-term: move Gemini key behind a server-side proxy so no LLM key ships in the client bundle.
- **Code-level hardening already completed:** (a) key sent via `x-goog-api-key` header, not URL `?key=` (avoids proxy/CDN logging); (b) API-key copy button removed from Settings; (c) API keys stripped from backup exports; (d) no dangerouslySetInnerHTML/XSS sinks, no telemetry exfiltrating chats.

### 163. Extract Connect-mode logic into useConnectThreads (REFACTOR slice 5, build 52)
- Extracted 198 lines of Connect state + 4 effects + bridgeQuestion + openConnectThread into `src/hooks/useConnectThreads.ts`. Owns: `connectCards`, `connectQuestion`, `connectAnswersRef` (memoized visited-answer cache), `connectVisitedVersion` (version bump for UI updates), `initConnectState()`, `bridgeQuestion()`, `openConnectThread()`.
- **Subtle stale-render guards carried verbatim:** (a) `skipStaleCardParseRef` — when switching terms/lenses, the panel's init effect arms a flag so the card parser doesn't key the PREVIOUS thread's JSON onto the newly-selected term (the "Connect shows the wrong drift" bug). (b) `!raw.startsWith('[')` prose guard — only parse as JSON if it looks like `[…]`, not prose (prevents "No connections found" after lens-switch when old prose answer lingers). (c) `chipSessionRef` — a ref tracking the active chip conversation so React batching can't lose messages before we save them to cache.
- All panel-owned state setters + shared `autoSentRef` passed as deps → hook reads/writes exactly what the inline implementation did. Verified with tsc + Playwright smoke: cards parse & render, tap bridge → streams in, back to suggestions → cards still present (cached), re-tap same bridge → restores instantly (zero new bridge AI calls).

### 162. Extract push/save actions into useDriftPanelActions (REFACTOR slice 4, build 52)
- Extracted 282 lines of push/save state + 7 handlers + 2 lifecycle helpers into `src/hooks/useDriftPanelActions.ts`. Exports: `pushedToMain`, `savedAsChat`, `savedMessageIds`, `isPushing` (state); `handlePushSingleMessage`, `handleToggleSaveMessage`, `handleSaveAsChat`, `handlePushToMain` (handlers); `resetPushSaveState`, `loadSavedMessageIds` (lifecycle).
- **Key logic moved intact:** (a) Push guards (content signature check + duplicate prevention via `pushedContentSig`). (b) Snippet save/unsave via `snippetStorage`. (c) Reset-push-button effect fires when new messages arrive post-push (shows "Push to main" button again, not "Undo push"). (d) `loadSavedMessageIds()` hydrates from DB on mount.
- DriftPanel now calls the hook at the top level, destructuring handlers + state; passed all required deps (driftOnlyMessages, selectedText, sourceMessageId, parentChatId, driftChatId, onPushToMain callback, onSaveAsChat callback, undo callbacks). Verified with tsc + live Gemini Playwright smoke: full drift flow works (create drift → send message → get reply → push/undo → save-as-chat/undo, all state transitions correct, no console errors).

### 161. Connect bridge question — localized to chat language (FIX, build 50)
- The Connect bridge question was still hardcoded English (`How does "X" connect to Y?`) → mixed LTR/RTL in Hebrew chats (per TestFlight screenshot). Added `bridge` to `DriftLabels` (EN/HE: `איך "X" קשור ל-Y?`); `bridgeQuestion()` now uses it; the connect-card tooltip uses the localized question too.
- **Critical companion fix:** two regexes detect a bridge thread by the English "connect to" text — `App.tsx` `bridgeUserMsg` (sets `connectQuestion` on open) and `DriftKnowledgeGraph.tsx` `nodeTopic` (map "X → Y" label). Both now also match the Hebrew `קשור ל-` form, so a localized bridge still opens as a conversation (not the cards list) and still labels correctly on the map. English alternation kept for back-compat with already-created bridges.

### 160. Map "Open this drift" bug — losing the answer (FIX)
- **Root cause:** Drift sessions registered into `chatHistory` at first-message (question only); answer only lived in temp store. `onOpenDrift` wrongly preferred the stale chatHistory snapshot over the fuller temp store.
- **Fixes:** (a) `onOpenDrift` + `resolveDriftRestore` now pick the FULLEST of three sources (ensures answer comes back). (b) Added debounced flush of growing drift conversation into chatHistory/IDB (survives reload; was in-memory only). `App.tsx`: new `driftPersistTimerRef`, 700ms debounce on each incoming message.

### 159. Synthesis "Next:" is now clickable (FEATURE)
- Extract the `**Next:**` open question from synthesis prose using a regex, strip it from the body (no duplication), render as a dedicated "Explore next" chip with the question text. Tap sends it as a real LLM call (`sendMessage` now accepts optional override text). RTL-aware (Hebrew question renders correctly).

### 158. Lens labels localized to chat language (FEATURE)
- Drift scaffolding (the opener + "Simplify this" / "Deep dive into this" / etc.) is now localized: Hebrew chat gets Hebrew labels, English chat gets English. Detected by script (Hebrew range `[֐-׿]`) sampled from the term + recent parent messages.
- **New module-level helpers:** `DRIFT_LABELS_EN` / `DRIFT_LABELS_HE` dicts, `driftLabelsFor()` sampler, `isDriftOpenerText()` / `isDriftScaffoldText()` predicates. All four internal filters that strip scaffolding from the API conversation now use language-agnostic predicates (so localizing doesn't leak the opener or create duplicates in pushed drifts). Hebrew labels: `opener`, `connectFinding`, `prefixes` dict.
- (Bundle: index ~806 kB / gzip ~241 kB — minimal change.)

### 157. Discoverability — one-time coachmarks (FEATURE)
- New `src/lib/onceFlags.ts` (`hasSeen`/`markSeen` + `useOnceFlag` hook, localStorage-backed, fails safe to "seen"). Two first-run hints for invisible affordances: (a) `App.tsx` — a drift-gesture pill above the composer once a reply is on screen, auto-dismissed forever the first time any drift opens; (b) `DriftPanel.tsx` — a lens-switcher hint under the "View as" bar, dismissed on first lens use. Map already had a teaching empty state — left as-is.

### 156. Continuity — survive reload + "pick up where you left off" (FEATURE)
- `App.tsx`: effect rebuilds the in-memory `lensRegistryRef` from persisted `driftInfos` on load, so per-term/lens threads survive a reload. New `resumableTrees` memo surfaces un-synthesized trees (≥2 real drifts) as resume cards in the empty state — tap switches to the chat, "✦ Bring it home" triggers `handleSynthesize`. (Composite `{id}__connect` lens-thread connect-state is still in-memory only — survives session, not reload; minor follow-up.)

### 155. Semantic concept layer — Gemini embeddings (FEATURE / INTELLIGENCE)
- The knowledge layer was lexical-only (`termIndex.findRelatedDrifts` exact+substring; `SearchModal` `indexOf`). Added meaning-based recall reusing the existing Gemini key (no new service):
  - `src/services/embeddings.ts` — `embedTexts` (model `gemini-embedding-001`, 768-dim via `outputDimensionality`, batch `:batchEmbedContents`, AbortController+timeout, graceful `[]` on any error) + `cosineSimilarity`.
  - `db.ts` — DB_VERSION 1→2, **additive** `drift-embeddings` store (guarded `oldVersion < 2`, chats untouched) + `embeddingDB` CRUD.
  - `src/lib/embeddingBackfill.ts` — debounced fire-and-forget backfill, djb2 content-hash so it re-embeds only on change, in-memory cache.
  - `src/lib/semanticRecall.ts` — merges lexical-first + semantic neighbors (threshold 0.62), returns `TermOccurrence[]` (no consumer shape change).
  - Wiring: `App.tsx` "you explored this before" (`relatedDrifts` shows lexical instantly, semantic fills in) + `SearchModal` "Related by meaning" section.
  - **Degrades to lexical with no key / Demo / offline.** Live test (`scripts/test-embeddings.mjs`): sim(Messi, "Argentine forward")=0.75, sim(Messi, PSG)=0.64, sim(Messi, photosynthesis)=0.49 → PASS.
  - `// TODO(semantic):` seams left in `DriftPanel.tsx` (Connect-lens seeding) + `DriftKnowledgeGraph.tsx` (semantic map edges) — deliberately out of scope.

### 154. Web QA — keyless Demo + mobile-web fixes (FIX)
- `DriftPanel.tsx`: added the `dummy` (Demo) provider branch — drifts were throwing "No Gemini key" in keyless Demo mode; `App.tsx` `selectedProvider` resolver now passes `'dummy'` through. `index.css`: `100dvh` (input bar no longer clipped by mobile browser chrome). `SnippetGallery.tsx`: `navigator.clipboard?.` guard (non-HTTPS). Removed `console.log`s that leaked the API key / full settings (`DriftPanel.tsx`, `settingsStorage.ts`).

### 153. Drift panel — Connect keying, lens/pill sync, per-term persistence (FIX)
- Root cause: the init effect was missing `driftChatId` in its deps, so switching terms left the previous term's Connect cards/messages mounted (Barcelona header showing Inter Miami's cards). Added `driftChatId` to deps (authoritative identity → header+messages+Connect reset together); `skipStaleCardParseRef` stops the parser keying the old drift's cards onto a new term; `messagesThreadRef` ensures per-term saves never land under the wrong key (fixes the "previous question vanished" symptom). Verified per-(term×lens) state persists across term switches (`navigateToSiblingDrift`→`resolveDriftRestore`) and lens switches (`handleSwitchLens`).

### 152. Drift Map — lineage + clickable-term nodes (FIX / FEATURE)
- `DriftKnowledgeGraph.tsx`: node `<title>` carries the full breadcrumb (Messi → PSG → goals) on hover/long-press; DetailCard shows a breadcrumb trail; plus an **at-a-glance** parent-term context label rendered above each drift node (e.g. `↳ PSG` over the goals question), RTL-safe, parent-hue. `InlineListLink.tsx`: clickable AI terms now dispatch `drift:start-from-term` → routed through `handleStartDrift`, so they record as real map nodes/edges (previously they only scrolled).

### 151. Drift Map — mobile open-then-close fix (FIX)
- Two compounding causes: the toggle double-fired (framer-motion tap + synthesized click flipped state twice), and the `ErrorBoundary` was conditionally mounted with `onError → close`, so any transient throw yanked the map shut on open. Fixed with a 450ms re-entrancy-guarded `toggleKnowledgeGraph` (reads live state via `getState`) and removed the auto-close-on-error (boundary now contains errors in place).

### 150. Sidebar — differentiate chats / drifts / synthesis (DESIGN)
- New `src/components/SidebarChatRow.tsx` + a grouping pass in `App.tsx`. Three distinct row types (Chat / Drift / Synthesis) each with its own icon + treatment; drifts nest under their source conversation (resolves up `parentChatId` to root) with a violet rail + `from <parent>` caption; synthesis detected via `/✦ Synthesis/i` on `lastMessage`. Search / rename / context-menu / pin all preserved.

### 149. Settings — remove Ollama/Qwen3 default seeds + lab-key clarity (FIX)
- `settingsStorage.ts`: dropped the default `ollama` (llama2) and `qwen3` presets from `defaultSettings.modelPresets`, AND added a migration in `get()` that strips `LEGACY_DEFAULT_PRESET_IDS = {ollama, qwen3}` from already-saved settings (stable ids; user-added Ollama/OpenRouter models get slugged ids so they're untouched). Ollama still available via "More options".
- `AddModelSheet.tsx`: made the OpenRouter-key requirement for routed labs unmistakable — a **"via OpenRouter"** badge by the lab name, the field relabelled **"OpenRouter API Key"**, and a note: "{lab} is reached through OpenRouter — paste your OpenRouter key (sk-or-…), not a native {lab} key." (Pasting a native `sk-…`/`sk-ant…` key in a routed lab would fail validation.)

### 148. Swipe-to-open-sidebar removed (FIX)
- A horizontal drag in the chat to select text was being read as an open-sidebar swipe, hijacking the drift selection tooltip. `useSwipeGesture` in `App.tsx` now passes `undefined` for the left/open callback; swipe-right-to-close is kept (no collision — no text selection while the sidebar is open). Sidebar still opens via the header menu button.

### 147. Settings screen redesign (DESIGN)
- Reworked within the canonical `DESIGN_SYSTEM.md` ("light from within"), not the frontend-design skill, to stay on-brand. New **brand-aware luminous glyphs** (`brandOf` + `ProviderGlyph`): each preset emits its lab's hue (OpenAI emerald, Anthropic Claude-clay #d97757, Grok near-white, Gemini sky, OpenRouter indigo, Ollama green, Demo violet), dimming when toggled off — this also visually distinguishes OpenAI/Anthropic/Grok even though they share the OpenRouter backend. Softer group cards (gradient surface, faint hairlines, rounded-2xl), refined section headers with an "N active" count, taller tappable rows, premium "Add a model" CTA, polished empty state, larger title + circular close button. Fixed a latent bug: panel drop-shadow used a Unicode minus (`−`) so it never rendered → real `-20px`. "Dummy AI" → "Demo AI".

### 146. Add Models — the four frontier labs (FEATURE)
- `AddModelSheet.tsx` reorganised: `LAB_PROVIDERS` (OpenAI · Anthropic · Google Gemini · xAI Grok) lead, then `MORE_PROVIDERS` (OpenRouter full search · Ollama · Demo). Introduced a brand/backend split: `ProviderMeta.id` is the UI brand, `ProviderMeta.backend` is the actual `Provider` stored on the preset. OpenAI/Anthropic/xAI use `backend: 'openrouter'` + an `orPrefix` (`openai/`·`anthropic/`·`x-ai/`); their model list is the **live OpenRouter catalog filtered by prefix** (never stale). Gemini path is byte-for-byte unchanged (native, `checkGeminiConnection`, `GEMINI_OPTIONS`). No new `Provider` union members → no dispatch/Settings changes; existing OpenRouter streaming path runs the routed labs. Research-backed: confirmed OpenAI has no browser CORS, Anthropic/Gemini do, Grok unclear, `CapacitorHttp` breaks SSE.

### 144. Content-generation quality — full prompt rewrite (QUALITY)
- Audited and rewrote every AI-generation surface for context-grounding, user-intent fidelity, and anti-generic output, within the existing parse contracts:
  - **`gemini.ts`**: `getSuggestedHighlights` (pick rich "doorway" phrases — proper nouns / terms of art / load-bearing concepts, strict verbatim-substring, temp 0.3, ban generic verbs & whole clauses), `getDriftSuggestions` (context-grounded, banned its own generic example templates, demands two distinct angles, role-labeled last-4 context), `getConnections` (disambiguation + grounded "back" links + cross-domain, context budget 1200→2000), `synthesizeDrifts` (honesty guard — don't force false connective tissue / invent facts).
  - **`DriftPanel.tsx`**: rewrote `TEMPLATE_SYSTEM_PROMPTS['simplify']` (one vivid analogy, smart-adult tone, aim for the "aha", ~120 words) and `['research']` (Deep dive — expert depth, mechanism/history/live-debates, specific names+dates, honest about contested points, skimmable); sharpened the Connect Rules (specific verifiable concepts, ≥1 tension, no duplicates/near-synonyms, no hallucination); rewrote the Connect bridge-answer prompt to demand the actual *link* (through-line / shared mechanism / influence / tension), lead with the surprising part, keep the term in frame; widened `parentContext` 6→8 messages with a 1200-char per-message cap.
  - **Latent bug fixed**: the multi-model *compare* path ignored `parentContext` entirely and used the weakest generic prompt → ungrounded answers that could disambiguate the term differently per model. Now uses the same context-grounded prompt as the single-model path.

### 143. Map — meaningful node & pill labels, not "Barcelona 1/2/3" (FIX)
- `nodeTopic` rewritten with a real priority chain: Connect bridge (`term → Y`) → genuine user question → **gist of the first real answer** (markdown/JSON stripped, first clause, iOS-15-safe: no regex lookbehind) → bare term only as last resort. So multiple lenses on one term (Simplify / Deep dive / Connect) now read by what they actually explored instead of a meaningless counter.
- `collectTopics` (the EXPLORED strip) now uses `nodeTopic` too, so the top-of-map pills are meaningful as well. `disambiguateTopics` kept as a final safety net. Graph labels truncate at 24, pills at 20, detail card wraps.

### 142. Map — filter field redesign (POLISH)
- Fixed-height pill (34px) aligned with the recenter button; stable width (removed the jarring focus-expand); `dir="auto"` so Hebrew/Arabic queries align RTL; cleaner clear-button hit target. `.dkg-search` padding + recenter button bumped to match heights.

### 141. Language — transliterate proper nouns + map bridge open (BUG FIX)
- **Transliteration**: `LANGUAGE_DIRECTIVE` (`gemini.ts`) used to say "keep proper nouns in their original script" — that's why a Hebrew chat showed "Johan Cruyff"/"Real Madrid"/"Catalan Nationalism" in Latin. Now it requires writing every proper noun in the conversation's OWN script (Hebrew chat → "יוהאן קרויף", "ריאל מדריד", "לאומיות קטלאנית"), only code/URLs/units stay Latin. Connect `<concept>` rule updated to match.
- **Map bridge open**: the Drift Map's "Open this drift" on a Connect *bridge* node ("ברצלונה → Johan Cruyff") dropped back to the connections cards screen instead of the bridge conversation. `onOpenDrift` (`App.tsx`) now detects a bridge thread (a user "…connect to Y" message in the node), passes its real messages + `connectQuestion` so DriftPanel opens the chip-chat answer view; the connections-LIST drift still opens clean (cards). Added `Message[]` resolution that's shared between the two paths.

### 140. Connect — relationship taxonomy + living map redesign (REDESIGN)
- Reworked the Connect lens card list (`DriftPanel.tsx:1290–1380`) from a flat uniform list into a **semantic relationship map** with live visual distinction:
  - **Relationship typing (language-agnostic):** Updated the Connect prompt to return `"<type> :: <relationship> :: <concept>"` where `<type>` is a language-invariant keyword (`origin·identity·influence·tension·history`) classifying the KIND of link. New module-scope `CONNECT_TYPES` registry maps each kind → hue + lucide icon. Parser remains backward-compatible with legacy 2-part (`"relationship :: concept"`) and bare-concept cached cards.
  - **Color + icon chips:** Each card now displays a leading icon chip (Landmark / Fingerprint / Sparkles / Swords / Clock) in its kind's hue (`origin`=#34d399 green, `identity`=#22d3ee cyan, `influence`=#a78bfa purple, `tension`=#fb923c warm amber, `history`=#fbbf24 yellow). `tension` edges use a dashed connector so opposition visually contrasts against the cool field. The type legend appears in the footer so the user understands the taxonomy.
  - **Alive hub + edges:** Hub node now breathes (`animate-breathe`); each edge has a glowing type-colored synapse dot on the rail (`box-shadow: 0 0 8px ${glow}`, `hover:scale-150`). Explored edges light up in their type color (the "where you've been" trail).
  - **RTL fix:** Whole block uses `dir={getTextDirection(selectedText)}` + logical Tailwind props (`border-s`/`ps-5`/`-start-*`/`text-start`/`ms-[6px]`) so the rail + arrows mirror for Hebrew and other RTL languages. Arrow icon swaps to `ArrowUpLeft` when `dir === 'rtl'`. Confirmed all logical utilities compiled into the bundle CSS.
  - **Dead space:** First-visit hint line ("Tap a connection to explore the bridge") + inline type legend (`presentKinds` footer chips) fill the lower area.
- Build + `npx cap sync ios` ✅; tsc + Vite clean; logical properties compile correctly. Not yet eyeballed on-device (needs a live Gemini call to populate cards with typed responses).

### 139. Drift Map — scoped error boundary + data hardening (BUG FIX / RESILIENCE)
- Intermittent WebKit-only crash on map open (`TypeError: null is not an object (evaluating 'O.current…')`) was hitting the APP-ROOT error boundary → full-page "Something went wrong / Refresh". Wrapped `<DriftKnowledgeGraph>` in a scoped `ErrorBoundary` (`fallback={null}`, `onError` closes the map) so a map failure can no longer take down the whole app — it auto-recovers and a re-tap remounts fresh. `ErrorBoundary` extended with optional `fallback`/`onError` and now logs the component stack via `componentDidCatch`.
- Hardened render-phase node helpers (`nodeTopic`, `lastAiPreview`) against missing `chat.messages`.
- Root cause not isolated from source (every map `.current` deref is guarded; not a hooks violation; did not repro in Playwright WebKit with real drifts). Next step if it recurs: read the component stack via Safari Web Inspector on-device.

### 138. No redundant LLM calls when re-opening an explored term+lens (BUG FIX)
- Re-opening an already-generated drift (header reopen pill, sibling switcher, "Drift into" chips, inline links, map) was re-firing a new generation because the entry point opened the drift without the saved content/`templateType`, so DriftPanel's auto-send wasn't suppressed.
- Added centralized `resolveDriftRestore(driftChatId, sourceMessageId, selectedText, parentMessages?)` in App.tsx — single source of truth returning `{ existingMessages, templateType, connectCards, connectAnswers }` from temp store + `connectCardsCache`/`connectAnswersCache` + the message's `driftInfos`. Wired into `reopenLastDrift`, `navigateToSiblingDrift`, and `handleStartDrift`'s open path; entry points reuse the existing `driftChatId` instead of minting a new one.
- DriftPanel backstop: init effect now sets `autoSentRef.current = true` whenever restored messages OR connect cards OR connect answers exist → an explored combination can never re-fetch; first-time generation still fires once.

### 137. Drift Map — "Open this drift" restores the real drift (BUG FIX)
- Map `onOpenDrift` (App.tsx) reopened Connect-lens drifts blank (just the term) because it never passed `templateType: 'connect'` or cached `connectCards`/`connectAnswers`. Now resolves them (via the same caches + `driftInfos`) and restores the already-generated content — no new LLM call. Connect nodes pass `existingMessages: []` (prose would poison the JSON card parser).

### 136. Connect — lens-switch "No connections found" fix (BUG FIX)
- Term → Connect → Deep dive → Connect again showed "No connections found." The card-parse effect ran on a render where `driftOnlyMessages` still held the previous lens's PROSE answer, failed `JSON.parse`, and wiped the restored cards to `[]`. Now it only parses when the text looks like a JSON array (`startsWith('[')`) and never blanks existing cards on parse failure.

### 135. Language matching — AI output follows the user's language (NEW, Gemini)
- Added exported `LANGUAGE_DIRECTIVE` in `gemini.ts` instructing the model to write all output (responses, suggestions, questions, labels, JSON values) in the user's/source language (Hebrew→Hebrew, English→English…). Wired into `sendMessageToGemini`'s system instruction (covers main chat + every drift) and the four standalone helpers (`getSuggestedHighlights`, `getDriftSuggestions`, `getConnections`, `synthesizeDrifts`). Gemini-only by request (OpenRouter/Ollama untouched).

### 134. Drift Map — informative node preview for Connect drifts (FIX)
- The map only read `driftStore.getTempConversation`, so Connect-lens drifts (whose Q&A lives in `connectAnswersCache` / parent `driftInfos.connectAnswers`) showed "0 msgs" and a blank preview card. `getTempMessages` now falls back to the connect-answers cache and the parent message's `driftInfos.connectAnswers`, so the node gets real message count + an answer-snippet preview.
- `DetailCard` title now uses `nodeTopic()` for drift nodes → shows the actual connection ("Juventus → Industrial Turin Identity") instead of the bare term.

### 133. "Drift into" suggestion chips — polish (POLISH)
- Label moved to its own line (uppercase section header) so wrapped chip rows align cleanly to the left (was inline with the first chip → ragged wrap).
- Roomier even grid (`gap-2`), larger tap target, subtle shadow, clearer hover/active, and a per-chip `↗` (ArrowUpRight) affordance that brightens on hover. Long terms truncate via `max-w-full` + `truncate`.

### 132. Drift Map — full-screen tap-to-preview explorer (REDESIGN)
- Mobile map is now **full-screen** (`fixed inset-0`), not an 88dvh bottom-sheet drawer — removed drag handle, rounded top, and dimmed backdrop; header gets a safe-area top inset.
- **Tap = preview, not jump:** tapping a node only selects + centers it (shows the detail card); navigation is a deliberate second step via the card's "Open this drift / Go to chat" button. Enter/Space still opens fully; arrow keys move + preview. EXPLORED chips also preview (select) instead of navigating away.
- **Removed the All / This chat scope toggle** — the map is always scoped to the current conversation (`scope` fixed to `'chat'`; toggle + `conversationCount` removed).

### 131. Drift Map — meaningful node labels (FIX)
- Nodes previously all showed the bare selected term (e.g. three identical "Barcelona"). Added `nodeTopic()` (surfaces the Connect bridge target / first real question, falls back to the term) + a per-node `labelById` map that runs `disambiguateTopics` so siblings stay distinct.

### 130. Drift synthesis — truncation fix (BUG FIX)
- `synthesizeDrifts` ran `gemini-3.5-flash` (a thinking model) with `maxOutputTokens: 1000`; reasoning tokens consumed the budget and the synthesis cut off mid-sentence (stray unclosed `**`). Raised to 4096 so the ~350-word answer completes and closes its markdown.

### 129. Synthesis message — polished card (POLISH)
- Synthesis messages (`id` starts with `synth-`) now render in a `.synthesis-card`: violet gradient border, soft glow, gradient title — reads as a deliberate artifact, not a stray message.

### 128. Horizontal text cutoff — app-wide fit fix (BUG FIX)
- Chat content (incl. synthesis) overflowed the right edge / was cut off. Root cause: the main chat column was `flex-1` without `min-w-0`, letting content widen past the viewport. Added `min-w-0` to the main column, `overflow-x: hidden` + `max-width:100%` on `.chat-messages-container`, and `overflow-wrap: anywhere` / `word-break` on `.ai-message`/prose (with code blocks/tables getting their own scroll). Added `min-w-0` on the message bubble too.

### 127. Connect — context-aware disambiguation (FIX)
- Connect ignored conversation context: "Barcelona" in a Messi thread returned city-of-Barcelona connections (Gaudí, Modernisme…). Connect prompt now gets a hard "DISAMBIGUATE BY CONTEXT" instruction that forces the term to be read through the surrounding conversation (FC Barcelona the club, not the city). Removed a latent double-append of context for Connect.

### 126. Term selection action bar — professional redesign (POLISH)
- The iOS selection bar (Drift / Simplify / Deep dive / Connect / Save) was cramped ("Deep dive" wrapped to two lines) with a cyan/violet/blue rainbow. Replaced emoji with consistent Lucide icons (BookOpen / Telescope / Link2), switched templates to a calm uniform icon-over-label layout (no wrap), kept Drift as the single gradient primary, and unified colors/dividers/padding into one polished control. Desktop tooltip updated to icons too.

### 125. Lens switcher — preserve Connect state across switches (FIX)
- Cache connect cards + visited-bridge answers per thread-id (`connectCardsCache` + new `connectAnswersCache`). Switching back to a Connect view restores its map AND tapped-connection indicators. Connect targets start with clean messages so bridge prose can't poison the JSON card parser.

### 124. Drift panel — "View as" lens switcher (NEW)
- A "View as" strip in the panel header re-views the SAME term through any lens (Drift / Simplify / Deep dive / Connect) without returning to the chat. Fixes terms being locked to their first action. Each lens keeps its own in-session thread via a per-term registry (`lensRegistryRef`, baseKey `msgId::term` → template → driftChatId); the original chat-linked thread is preserved at its id. Hidden inside Connect's bridge sub-mode.

### 123. Connect view → relationship map + bridge-maker (REDESIGN)
- Connect is no longer "more suggestions" (which duplicated the drift screen). The term is a hub with labeled relationship edges to related concepts; tapping an edge opens a thread where the AI draws the bridge between the two. "Connect to anything…" input bridges to any typed concept.
- Connect system prompt now returns `"<relationship> :: <concept>"` pairs (connectCards stays `string[]`; old bare-string cards still render). Bridge questions ride the existing `connectQuestion` flow (display + prompt). Removed dead `getConnections`/`connections` machinery.

### 122. Connect view — forward-only "Drift ideas" list (REDESIGN, superseded by #123)
- Removed both backward-looking sections ("You explored this before" + "How this relates to where you've been"). Connect is now purely about where to go next.
- Merged "Directions you could drift" + "Explore from here" into ONE deduped list of tappable doorways (questions first, sharper angles below), each opening a focused thread, with `↗` → cyan visited-dot. Prior-drift context still feeds the AI prompt; it's just no longer shown as a block.
- Removed now-unused imports/props (`Reveal`, `History`, `Compass`, `CornerUpLeft`, `onOpenRelatedDrift` destructure).

### 121. Conversation forking (NEW)
- Fork button (GitBranch) on AI messages → `handleForkChat`: creates a new sibling conversation carrying everything through that point (drift markers cleared), switches to it. `metadata.forkedFrom` / `forkedAtMessageId` link back. "What if I'd asked X instead?"

### 120. Suggested next terms — "Drift into" chips (NEW)
- Chip row under each AI answer from unexplored `suggestedHighlights` (already highlighted inline; now also explicit one-tap drift chips).

### 119. Drift Map — keyboard navigation + filter box (NEW)
- Arrow keys walk node→node spatially, Enter/Space opens, view re-centers on selection. Floating filter input dims non-matching nodes; Enter jumps to first match.

### 118. Full-text search across all chats + drifts (NEW)
- `SearchModal.tsx` command palette (⌘K): searches every message in every conversation/drift, ranked, keyboard-navigable, jumps + highlights. Header search button added.

### 117. Drift synthesis — "bring it home" (NEW)
- `synthesizeDrifts()` in gemini.ts weaves every descendant drift of a conversation into one markdown synthesis. Synthesize bar in the Drift Map (chat scope, ≥2 drifts) posts it back on the conversation and scrolls to it.

### 116. Global "All explorations" map (NEW)
- `DriftKnowledgeGraph` scope toggle **This chat / All**; "All" builds a synthetic super-root forest (`buildForest`) of every conversation. Node activation now keys off `isDrift` (drift→panel, chat→switch), not depth.

### 115. Model-agnostic Add Model flow (REDESIGN)
- `AddModelSheet` rebuilt provider-first: pick provider (Gemini / OpenRouter / Ollama / Demo) → connect (API key or server URL, validated) → choose model(s). OpenRouter & Ollama fetch live model lists (searchable) + accept custom IDs. Outputs generic `ModelPreset[]`. Aligned provider dot colors across picker/pill/settings.

### 114. Always-visible breadcrumb in main header (NEW)
- When the active chat is a drift, the header shows the full path `root › term › term` (was only inside the drift panel); each crumb taps to that chat and scrolls to the branch point.

### 113. Lateral term-walking — sibling switcher (NEW)
- Sibling strip under the drift-panel header: prev/next + scrollable pills of every term branched from the same parent; walk term→term in place, active pill auto-scrolls into view.

### 112. Reopen-last-drift pill scoped to active chat (BUG FIX)
- The header reopen pill leaked a stale drift from another conversation onto a fresh chat. Now gated on `lastDrift.parentChatId === activeChatId`.

### 111. iOS bundle staleness resolved (INFRA)
- Confirmed iOS loads bundled `dist/` (no live-reload server). Stale May 31 bundle was being rebuilt by Xcode; `npm run build && npx cap sync ios` now required after web changes. Build bumped to 35.

### 110. Drift Tree — card tap opens existing drift correctly on mobile (BUG FIX)
- Replaced `handleStartDrift` (designed for new drifts) with a direct `driftStore.openDrift()` call when opening from tree card — bypasses the complex message-index-finding logic that was producing blank panels.
- Three-tier message fallback: `chatHistory` → `driftStore.getTempConversation` → `driftChat.messages` (the node itself always has messages since the tree renders the count).
- Context messages resolved from the parent chat's stored messages, not the stale closure — fixes the case where `switchChat` hasn't settled before context is read.

### 109. Drift Tree — mobile design compact pass (POLISH)
- Bottom sheet: `88dvh` (was 92), `16px` border radius (was 20px).
- Header: title `15px` clamped to 1 line (was 17px / 2 lines), tighter padding, close button `30×30` (was 36×36), drift badge text `10px`.
- Cards: padding `9/11px` (was `12/14px`), title `13px` (was `15px`), preview `11px` uniform on all sizes.
- Topics strip: label `9px`, chips `11px` / `3px 10px` padding / `26px` min-height.

### 108. Drift Tree — duplicate "Explored" chips disambiguated (FIX)
- Added `disambiguateTopics()`: two-pass over collected phrases — if "guitarist" appears twice, chips become "guitarist 1" / "guitarist 2". Single occurrences are unchanged.
- Applied in both mobile and desktop paths via `disambiguateTopics(collectTopics(tree))`.

### 107. Drift Tree — "Explored" chip bar horizontally scrollable (FIX)
- Added `flexWrap: 'nowrap'` to the chips scroll container — chips no longer wrap to a second line when there are many topics.
- Scrollbar hidden on all browsers (`scrollbarWidth: none` + `[&::-webkit-scrollbar]:hidden`) for a clean invisible-scroll feel.
- Applies to both desktop panel and mobile bottom sheet.

### 106. Drift Tree card → anchor scroll + open drift panel (NEW BEHAVIOUR)
- Tapping a drift card in the tree now: (1) switches to parent chat if needed, (2) smooth-scrolls the main chat to the exact source message anchor, (3) opens the DriftPanel with the existing drift conversation loaded. No more "just switch chat ID" — you land at the right place.
- Added `onOpenDrift` prop to `DriftKnowledgeGraph`. Mobile closes the bottom sheet on tap.

### 105. Drift Tree UX cleanup — redundant elements removed (POLISH)
- **Removed** per-message `↗ drift` badge below each message — the inline highlighted drift links already handle navigation, badge was redundant.
- **Removed** the old network-graph SVG icon from the top bar.
- **Removed** floating bottom-right `Drift Tree (N)` pill.
- **Added** Drift Tree button in header (right side, next to +New Chat): uses the app's own favicon icon (three-node graph with pink→violet gradient), shows a purple count badge, toggles active state when tree is open.

### 104. Drift Tree — desktop push layout (LAYOUT)
- When Drift Tree opens on desktop, main chat area slides left (shrinks `480px` from right) — like resizing a window. Full chat remains visible beside the tree panel.
- Desktop backdrop overlay removed (no dimming needed when content is pushed aside).
- Input bar and scroll-to-bottom button also reposition correctly.
- Mobile: unchanged — full-screen bottom sheet with backdrop.

### 103. Drift tree — two `↗ drifts` tags disambiguated (POLISH)
- Floating pill relabelled `GitBranch icon + "Drift Tree" + (N)` — clearly an overview action, not a per-message count.
- Inline badge simplified: `↗ drift` (singular, no count) vs `↗ N drifts` (multi).

### 102. Drift Tree — mobile-first redesign (MAJOR POLISH)
- **Mobile:** full-screen bottom sheet (`92dvh`), slides up from bottom, rounded top corners, drag handle, swipe-down-to-dismiss (80px threshold), blurred backdrop.
- **Cards:** 15px title, 12px preview, 10–11px labels — readable on mobile. Min touch target 44px. `active:scale-[0.98]` haptic feel.
- **Phrase pills:** larger (10px, rounded-full, border), max 28 chars.
- **Connector lines:** 1.5px wide for Retina visibility.
- **Topics strip:** horizontal scroll, 30px-tall chips.
- **Card top row fixed:** label left, msg-count pill + chevron right — no more text overlap.
- **Timestamp** moved to card bottom-right, its own line.
- **Collapse chevron** now `ChevronDown`/`ChevronRight` (semantically correct).

### 101. Drift Tree — topics strip, timestamps, collapsible branches (POLISH)
- **Topics strip:** Row of coloured chips below header — one per phrase drifted on, cycling violet→indigo→blue. Click any chip to jump directly to that drift.
- **Timestamps:** Relative time ("just now", "5m ago", "2h ago") per card.
- **Collapsible branches:** Chevron toggle on any card with children. Shows "N hidden branches" summary.

### 100. Drift Tree — complete visual overhaul, Apple-grade polish (REDESIGN)
- Width: `min(560px, 44vw)`. Titles wrap to 2 lines. Preview 120 chars / 11px / 2 lines.
- Depth palette: depth 1 = violet, depth 2 = indigo, depth 3+ = blue.
- Thick 3px coloured left accent border on drift cards. Hover shadow; active glow ring.

### 99. Drift Tree — complete rebuild, dropped ReactFlow (MAJOR REFACTOR)
- Replaced `@xyflow/react` with pure HTML/CSS/SVG indented tree list.
- Fixed duplicate node bug and stale message count.

### 94. "↗ 1 drift" button — correctly reopens existing drift conversation (BUG FIX)
### 93. Knowledge graph — edge labels show selected phrase (POLISH)
### 92. Knowledge graph — depth hierarchy visible via node styling (NEW)
### 91. Knowledge graph — direction-aware edge handles (BUG FIX)
### 90. Knowledge graph — live updates + node click keeps panel open (BUG FIX)
### 89. Unified radial mind map — replaced DriftMapPanel + DriftKnowledgeGraph (MAJOR REDESIGN)
### 88. Nested drift map reliability — critical bug fix (BUG FIX)
### 87. Phrase truncation removed / 86. ↗ drift tag on all pushed messages / 85. AddModelSheet in Settings (FIX/POLISH)

### 81. Subtle ↗ drift tag on pushed messages (FIX/POLISH)
### 80. Key-term highlights inside drift panel messages (NEW FEATURE)
### 79. Knowledge Graph — light mode support (FIX)
### 78–68: [see archived sessions below]

---

## Sessions 1–67 (archived)

| # | What |
|---|---|
| 67 | Previous session marker |
| 64 | Drift exploration bar — compact single-row redesign |
| 63 | Dead code removed (AddModelSheet JSX stub, addModelSheetOpen state) |
| 62 | Input buttons vertically centered (absolute top-0 bottom-0) |
| 61 | Drift breadcrumb navigation in DriftPanel header |
| 60 | Send arrow — no grey idle background |
| 59 | Sidebar dividers — bumped opacity (was invisible in dark mode) |
| 58 | Settings toggles — Apple UISwitch proportions |
| 57 | Drift reopens blank fix + nested Drift Map branches fix |
| 55 | Welcome screen cut off by keyboard — pt-[22vh] fix |
| 54 | "AI Settings" → "Settings" rename |
| 53 | Sidebar chat list — flat divider layout |
| 52 | App logo + favicon + iOS app icon — network icon brand |
| 51 | Drift map — nested temp drifts visible |
| 50 | Drift badge / inline link — opens existing drift correctly |
| 49 | Drift badge — moved to action row |
| 48 | Drift Map panel — light mode color fix |
| 47 | DriftMapPanel — bird's eye view (now superseded by radial graph) |
| 46 | Per-message drift count badge |
| 45 | Drift inline link restyle (underline only) |
| 44 | First-message coach mark (one-time floating pill) |
| 43 | New chat on every app open; input bar safe-area gap fix |
| 42 | Retroactive multi-model — stale activeBroadcastGroupId fix |
| 41 | Retroactive multi-model — user message in carousel fix |
| 40 | Input field gap when keyboard open fix |
| 39 | [object Object] in main chat on drift open — walkNode fix |
| 38 | [object Object] in Gemini grounding responses — multi-part SSE fix |
| 37 | Model tag badge overlapping drift message text fix |
| 36 | "Ask Drift" iOS text selection explored + reverted |
| 35 | Model tag label — increased opacity |
| 34 | Pushed drift messages — redesigned as regular AI messages |
| 33 | Drift context — parent conversation included in system prompt |
| 32 | Scroll reliability — touch-action pan-y |
| 31 | Swipe left/right to open/close sidebar |
| 30 | Multi-model continue — stale closure fix |
| 29 | Drift bottom bar — reliability overhaul (6 root causes) |
| 28 | Single-model → retroactive multi-model carousel |
| 27 | Model picker light mode fix |
| 26 | Scroll overlap in multi-model mode |
| 25 | User message not appearing after Continue on mobile |
| 24 | Drift bottom bar — full redesign (glassmorphic) |
| 23 | Continue button moved below content |
| 22 | Multi-model carousel swipe enabled |
| 21 | Single-model mode — remove purple dot |
| 20 | Drift bottom bar restored (.ai-message class) |
| 19 | Multi-model carousel text overflow fix |
| 18 | Input field polish (inactive send button) |
| 17 | DriftPanel input — match main chat layout |
| 16 | Retroactive model add to broadcast group |
| 15 | Multi-model carousel — frameless card design |
| 14 | Continue → button Gemini cases |
| 13 | Model selection toggle revert bug |
| 12 | Model picker light mode visibility |
| 11 | Voice input restart fix (fresh instance on onend) |
| 10 | Voice input toggle fix |
| 9 | ChatGPT-style input field (mic + send inside textarea) |
| 8 | iOS drift text selection — persistent bottom bar |
| 7 | Mobile multi-model chat (pills row + carousel + ModelPickerSheet) |
| 1–6 | AI reply design, DriftPanel keyboard fix, sidebar width, input placement, design polish, voice input initial |



## Current Architecture

```
src/
  App.tsx                    ~3000 lines
  hooks/
    useVoiceInput.ts         tap-to-speak, fresh-instance restart, 3-tier fallback
    useAutoScroll.ts
    useToast.ts
  store/
    chatStore.ts             chat sessions + IndexedDB persistence
    driftStore.ts            drift panel open/closed + temp conversations
    modelStore.ts            selected targets + per-chat model prefs (+ dummy provider)
    uiStore.ts               panels + theme (dark/light) state
  services/
    gemini.ts                PRIMARY — Gemini REST + SSE + grounding
    openrouter.ts            secondary
    ollama.ts                local models
    dummyAI.ts               streaming demo model (Demo AI)
    db.ts                    IndexedDB (idb)
    settingsStorage.ts       localStorage settings
  components/
    DriftPanel.tsx           ~1000 lines — side panel (keyboard-aware input)
    DriftKnowledgeGraph.tsx  mobile bottom sheet + desktop push panel — pure HTML/CSS tree, topics strip, anchor navigation
    SelectionTooltip.tsx     iOS: persistent bottom bar; desktop: floating tooltip
    MultiModelCarousel.tsx   mobile swipeable card carousel for broadcast
    ModelPillRow.tsx         model selection chips above input (mobile, light+dark)
    ModelPickerSheet.tsx     bottom sheet model picker (up to 3 models)
    Settings.tsx             settings panel
    Login.tsx                mobile + desktop layouts
    HeaderControls.tsx       model picker chip (desktop)
ios/
  App/                       Capacitor Xcode project
```

---

## Running Locally

```bash
cd /Users/morhogeg/Drift
npm run dev                            # web dev server
npm run build && npx cap sync ios      # build + sync to Xcode
```

**API key**: create `.env` in project root:
```
VITE_GEMINI_API_KEY=your_key_here
```

---

## What's Pending / Next Ideas

- [ ] **☁️ OWNER SETUP — Cloud accounts** — Create Firebase project (pay-as-you-go, no free tier), fill `.env` with 6 VITE_FIREBASE_* vars, enable Apple provider, register Services ID (com.morhogeg.drift.icloud-container), add Xcode capability (Sign in with Apple), update GoogleService-Info.plist, deploy firestore.rules. Detailed checklist in CLOUD_ACCOUNTS_HANDOFF.md.
- [ ] **Open 3 cloud PRs** — Once `gh auth login` is executed: `feature/cloud-auth` → `feature/cloud-accounts`, `feature/cloud-sync` → `feature/cloud-accounts`, `feature/cloud-ui` → `feature/cloud-accounts`. Code complete, tests pass, Playwright verified.
- [ ] **TestFlight submission (build 59)** — Archive in Xcode GUI → upload to App Store Connect. Build number incremented 58→59, Capacitor synced, web assets ready. Requires: Xcode `ios/App/App.xcworkspace` → Product > Archive → Distribute App → TestFlight → Upload.
- [ ] **On-device pass — cloud accounts (build 59)** — verify: (1) Sign in with Apple works on device; (2) Back up now / Restore / Sign out flow; (3) No Account UI visible when cloud disabled; (4) API keys NOT in backup payload (key-strip tests prove it, but verify on device).
- [ ] **On-device pass — UI polish (build 59)** — verify: arc label reads "related" (not "by field"); sidebar shows exactly one blank "New Chat" (no dupes); no "reopen last drift" chip in header.
- [ ] **On-device pass — mobile UX (build 55)** — verify: model picker moved to sidebar (no composer clutter); lens-drift push works + shows in-panel confirmation + glow on return to main; header no longer crowded (breadcrumb/pill flex correctly); mobile audit fixes (keyboard lift, selection bar scroll, touch targets, safe-area, RTL, footer compact); no regressions.
- [ ] **On-device pass — prior sessions** — verify: map "Open drift" bug (shows full conversation + persists reload); synthesis "Next" clickable; lens labels localized (Hebrew); sidebar row types (Chat/Drift/Synthesis) + nesting; Drift Map opens on single tap; map node `↳ parent` labels + breadcrumb; clickable AI terms on map; Connect shows selected term's cards (no cross-bleed); per-term/lens persists across switches; resume cards in empty state; coachmarks (drift gesture, lens bar); "Related by meaning" search + "explored before" recall; Drift + map redesign stability.
- [ ] **TODO(semantic) follow-ups** — seed the Connect lens from semantic neighbors (`DriftPanel.tsx`); draw semantic edges on the Drift Map (`DriftKnowledgeGraph.tsx`). Persist composite `{id}__connect` lens-thread connect-state to `driftInfos` (currently in-memory only).
- [ ] **On-device pass — providers/settings wave** — verify: (1) Add a model → OpenAI/Anthropic/Grok with an OpenRouter `sk-or-…` key actually streams; (2) Settings redesign reads well (branded glyphs, cards); (3) Ollama/Qwen3 gone from the Models list; (4) selecting text in chat no longer opens the sidebar.
- [ ] **On-device pass — content wave (Hebrew)** — Connect concepts in Hebrew script (no Latin); meaningful map labels (no "Barcelona 1/2/3"); bridge "Open this drift" opens the conversation; filter field; overall Connect/Simplify/Deep-dive quality.
- [ ] **(Optional) Native Anthropic + Gemini** — if a native Anthropic key is wanted, wire `api.anthropic.com` directly (CORS ok with `anthropic-dangerous-direct-browser-access` header); would make OpenAI/Grok-via-OpenRouter a hybrid. Left as-is for now by request.
- [ ] **Message editing + regeneration** — click to edit a sent message, regenerate the AI response. `updateMessage` already exists in chatStore.
- [ ] **Custom system prompts per chat** — per-chat persona/instruction. Services already accept system messages.
- [ ] **Export & Share** — export chat + its drift tree as Markdown/PDF. (Deferred by request.)
- [ ] **Security: Gemini key client-side** — key is bundled in the web build; move behind a proxy before any public release. (Deferred by request.)
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **Light theme color polish** — some hardcoded dark hex colors remain
- [ ] **App.tsx refactor** — ~3.9k lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
- [ ] **Cleanup** — `DriftMapPanel.tsx` is dead code (graph replaced it); `onOpenRelatedDrift` prop now unused in DriftPanel. Map scope toggle removed (#132) → `buildForest`/forest "All explorations" path is now dormant (scope fixed to `'chat'`); remove if the global map isn't coming back.

## Completed this session (was pending)
- ✅ AddModelSheet OpenRouter & Ollama · ✅ Conversation forking · ✅ Full-text search · ✅ Drift synthesis
