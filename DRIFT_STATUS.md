# Drift — Quick Status

**Date:** June 10, 2026 | **Branch:** `fix/sidebar-map-chip-polish` | **Build:** 59 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Jun 10) — Cloud accounts + UI polish

- **Cloud accounts (Phase 1–3 complete):** Apple Sign-In (native iOS + web), backup/restore with 5s debounce, key-stripping guarantee (6 vitest tests). Dynamic imports ensure Firebase never fetches when disabled. Playwright verified. Three feature branches ready for PR (pending `gh auth login`). Owner setup checklist in HANDOFF.md.
- **UI polish:** Arc label "related" (not "by field"), removed header "reopen last drift" chip, fixed sidebar blank-chat deduplication.
- **Build 58→59**, production bundle: 298.45 kB JS / 125.54 kB CSS (gzip 86.48 / 18.60 kB). tsc + vite + cap sync clean.

## Pending (priority order)

- [ ] **☁️ Owner setup — Cloud accounts** — Firebase project + .env vars + Apple provider + Services ID + Xcode capability + plist + firestore.rules. Checklist in CLOUD_ACCOUNTS_HANDOFF.md.
- [ ] **Open 3 cloud PRs** (code ready, awaiting `gh auth login`)
- [ ] **TestFlight build 59:** archive in Xcode → App Store Connect
- [ ] On-device pass: cloud accounts (sign-in flow, backup/restore, no Account UI when disabled, API keys not leaked)
- [ ] On-device pass: UI polish (arc label, sidebar blanks, no reopen chip)
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Cloud:** Firebase 12.x (JS SDK) + @capacitor-firebase/authentication 8.3 (Apple Sign-In native sheet iOS, popup web). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache. **Primary LLM:** Gemini REST+SSE. **Routed labs:** OpenRouter. **Single-model only**. **State:** Zustand 5 (chat/drift/model/ui/auth) · **DB:** IndexedDB via idb (v2 schema + users backup). Drift Map = pure SVG + HTML. **Bundle:** manualChunks (vendor cacheable). App.tsx ~3k lines · DriftPanel.tsx ~1.3k.

## Key files

`src/lib/cloudConfig.ts` (gate) · `src/services/firebase.ts` (lazy init) · `src/services/auth.ts` (Apple sign-in) · `src/services/cloudSync.ts` (backup/restore) · `src/services/cloudKeyStrip.ts` (key removal + tests) · `src/components/account/SignInSheet.tsx` · `src/components/account/AccountSection.tsx` · `src/App.tsx` (main integration) · `src/services/gemini.ts` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
