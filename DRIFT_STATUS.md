# Drift — Quick Status

**Date:** June 11, 2026 | **Branch:** `main` | **Build:** 60 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Jun 11) — Welcome-screen polish

- **No scroll:** empty state now vertically centered (dropped the `22vh` push) and reclaims the input's reserved padding when `messages.length === 0`; compacted hero + "Pick up where you left off" cards (inline `✦ Synthesize N`, no standalone button row).
- **Three capability tooltips** replace the single drift hint: **Highlight to drift** · **Shift lenses** · **Synthesize drifts**, with custom glass popovers that open downward (no header clipping).
- **Definition-style copy** (no em dashes): bold name + quiet gloss subline. Drift & Synthesize as numbered steps; drift covers the full loop **Select → Branch → Push → Return**.
- **Lenses color-coded** to each lens's real signature hue (Simplify amber · Deep dive blue · Connect cyan · Challenge rose), matching the in-panel "View as" bar; Challenge notes the rival-model second opinion.
- Build 59→60, committed + pushed to `main`.

## Previously (Jun 11) — Launch prep

- Arabic RTL + centralized `src/lib/lang.ts` detection; prod API-key-leak fix (BYOK in prod); App Store metadata + privacy policy + 5 dark screenshots (`scripts/shots.mjs` + `frame.mjs`). EN/HE only (extra translation bundles reverted).

## Cloud accounts (Jun 10) — built, awaiting owner Firebase setup

Optional Apple sign-in + cloud backup/restore (Firestore, `users/{uid}/backup/current`). Stacked branches `feature/cloud-auth` → `feature/cloud-sync` → `feature/cloud-ui`, PRs into `feature/cloud-accounts`. **Inert until `.env` has all `VITE_FIREBASE_*` filled** — verified zero behavior change when blank. API keys never upload (deep-strip + test). Owner checklist in HANDOFF.md "☁️ Cloud accounts" section: Firebase project + Apple provider + Services ID + Xcode capability + `GoogleService-Info.plist` + deploy `firestore.rules`. ⚠️ Don't build iOS from these branches until the plist is in place.

## Pending (priority order)

- [ ] **☁️ Owner setup — Cloud accounts** — Firebase project + .env vars + Apple provider + Services ID + Xcode capability + plist + firestore.rules. Checklist in CLOUD_ACCOUNTS_HANDOFF.md.
- [ ] **TestFlight build 60:** archive in Xcode → App Store Connect
- [ ] **App Store:** add `PrivacyInfo.xcprivacy` to Xcode target · age rating · confirm/create ASC app record · finalize metadata + screenshots
- [ ] On-device pass: welcome screen (no scroll, tooltips, lens hues) · cloud accounts · UI polish
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Cloud:** Firebase 12.x (JS SDK) + @capacitor-firebase/authentication 8.3 (Apple Sign-In native sheet iOS, popup web). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache. **Primary LLM:** Gemini REST+SSE. **Routed labs:** OpenRouter. **Single-model only**. **State:** Zustand 5 (chat/drift/model/ui/auth) · **DB:** IndexedDB via idb (v2 schema + users backup). Drift Map = pure SVG + HTML. **Bundle:** manualChunks (vendor cacheable). App.tsx ~3.5k lines · DriftPanel.tsx ~1.3k.

## Key files

`src/App.tsx` (welcome/empty state + main integration) · `src/lib/cloudConfig.ts` (gate) · `src/services/firebase.ts` (lazy init) · `src/services/auth.ts` (Apple sign-in) · `src/services/cloudSync.ts` (backup/restore) · `src/services/cloudKeyStrip.ts` (key removal + tests) · `src/components/account/SignInSheet.tsx` · `src/components/account/AccountSection.tsx` · `src/services/gemini.ts` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
