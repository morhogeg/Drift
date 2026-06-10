# Drift — Quick Status

**Date:** June 9, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 58 (iOS + web) — ready for TestFlight
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ **CRITICAL ACTION REQUIRED:** Rotate both exposed Gemini API keys + raise spend cap in Google AI Studio. See HANDOFF.md entry 164.

## Last Session (Jun 9 continued) — Model-name label removed

- **Removed redundant model name from chat** — deleted the "Gemini 3.1 Flash Lite" label that appeared above each AI reply (line 2287–2289 in `App.tsx`). Model name still visible in header picker, so no loss of information — only visual clutter gone. Verified via Playwright: AI reply renders clean with no model-tag label or standalone model-name text.
- **Build 57→58**, production bundle: 294.06 kB JS / 124.41 kB CSS (gzip 85.42 / 18.38 kB). tsc + vite + cap sync clean.

## Cloud accounts (Jun 10) — built, awaiting owner Firebase setup

Optional Apple sign-in + cloud backup/restore (Firestore, `users/{uid}/backup/current`). Stacked branches `feature/cloud-auth` → `feature/cloud-sync` → `feature/cloud-ui`, PRs into `feature/cloud-accounts`. **Inert until `.env` has all `VITE_FIREBASE_*` filled** — verified zero behavior change when blank. API keys never upload (deep-strip + test). Owner checklist in HANDOFF.md "☁️ Cloud accounts" section: Firebase project + Apple provider + Services ID + Xcode capability + `GoogleService-Info.plist` + deploy `firestore.rules`. ⚠️ Don't build iOS from these branches until the plist is in place.

## Pending (priority order)

- [ ] **🔴 Rotate Gemini keys + raise spend cap** (user action, not code) — two keys exposed
- [ ] **Cloud accounts owner setup** — Firebase project, Apple auth provider, `.env` vars, plist (see HANDOFF.md ☁️ section)
- [ ] **TestFlight build 58:** archive in Xcode → App Store Connect (language fix + highlights + map colors + synthesis + model-label removal)
- [ ] On-device pass: highlights (English→English, Hebrew→Hebrew; key brands always included; each term ≤1 underline)
- [ ] On-device pass: map lens colors (card colors match lens type — amber/blue/cyan/rose)
- [ ] On-device pass: UI polish (no model-name label above replies; chart/message content starts fresh)
- [ ] On-device pass: prior sessions (synthesis honest/trail, mobile UX, header/footer, audit fixes, keyboard lift, RTL)
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache + semantic recall. **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs:** OpenRouter (OpenAI/Anthropic/Grok streaming). **Single-model only** (broadcast removed Jun 5). **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb (v2 schema). Drift Map = pure SVG + HTML cards (Hebrew-safe). **Synthesis:** adaptive (synthesis/trail), source chips reopen drifts in-panel. **Bundle:** manualChunks (vendor cacheable). App.tsx ~3.2k lines · DriftPanel.tsx ~1.3k (decomposed into hooks).

## Key files

`src/App.tsx` (`processHighlightsText`, `openExistingDrift`, `exploredLenses`) · `src/services/gemini.ts` (`detectLanguage`, `languageDirective`, `getSuggestedHighlights`, `synthesizeDrifts`) · `src/components/DriftPanel.tsx` (lens bar) · `src/components/DriftKnowledgeGraph.tsx` (`LENS_COLORS`, `lensColor`) · `src/components/SelectionTooltip.tsx` · `src/hooks/useDriftPanelActions.ts` · `src/utils/rtl.ts` · `vite.config.ts`
