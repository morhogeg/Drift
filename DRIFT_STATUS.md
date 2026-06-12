# Drift — Quick Status

**Date:** June 12, 2026 | **Branch:** `main` | **Build:** 61 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Jun 12) — Second opinion lens + evidence citations

- **Challenge → Second opinion:** renamed the lens to frame feedback as independent (agrees/agrees-with-caveats/disagrees) rather than adversarial. New prompt explicitly forbids manufacturing disagreement.
- **Steelman removed** — Evidence now the only extra built-in lens.
- **Evidence upgraded:** prompts for high-quality citations via Google Search grounding, peer-reviewed sources (meta-analyses, Cochrane, RCTs, WHO/NIH/CDC), specific citations with year/journal/sample size, evidence hierarchy (meta-analysis > RCT > observational > anecdote).
- **UI fixes:** duplicate "Second opinion on this" label removed from sidebar; numbered-list layout bug fixed (orphaned markers from inline span → anchor on `<li>`).
- Build 60→61, all tests green, tsc clean.

## Pending (priority order)

- [ ] **TestFlight build 61:** archive in Xcode → App Store Connect
- [ ] **App Store:** add `PrivacyInfo.xcprivacy` to Xcode target · age rating · confirm/create ASC app record · finalize metadata + screenshots
- [ ] **☁️ Owner setup — Cloud accounts** — Firebase project + .env vars + Apple provider + Services ID + Xcode capability + plist + firestore.rules
- [ ] On-device pass: welcome screen · second opinion lens · list layout · cloud accounts (if enabled)
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Cloud:** Firebase 12.x (JS SDK) + @capacitor-firebase/authentication 8.3 (Apple Sign-In native sheet iOS, popup web). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache. **Primary LLM:** Gemini REST+SSE with Google Search grounding. **Routed labs:** OpenRouter. **Single-model only**. **State:** Zustand 5 (chat/drift/model/ui/auth) · **DB:** IndexedDB via idb (v2 schema + users backup). Drift Map = pure SVG + HTML. **Bundle:** manualChunks (vendor cacheable). App.tsx ~3.5k lines · DriftPanel.tsx ~1.3k.

## Key files

`src/App.tsx` (main integration) · `src/lib/driftPanel.ts` (drift labels + prompts) · `src/services/gemini.ts` (Gemini stream + grounding) · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/components/DriftMessageBubble.tsx`
