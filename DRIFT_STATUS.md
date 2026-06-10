# Drift — Quick Status

**Date:** June 11, 2026 | **Branch:** `main` | **Build:** 59 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

## Last Session (Jun 11) — Launch prep (i18n/RTL, key-leak fix, App Store assets)

- **Arabic RTL + lang detection:** broadened `src/utils/rtl.ts` to Hebrew+Arabic; new `src/lib/lang.ts` central detector; `gemini.ts` delegates to it (directive unchanged). es/ru/ar/it/ja translation bundles were considered but **reverted** — EN/HE only (AI content already localizes).
- **Prod API-key-leak fix:** dev key moved to `.env.development.local` (gitignored); `.env` emptied; `.env.production` pins keys empty. Verified prod bundle has no key, dev still does. Production = BYOK.
- **App Store assets:** `APP_STORE_METADATA.md`, `PRIVACY_POLICY.md`, baseline `ios/App/App/PrivacyInfo.xcprivacy` (⚠️ add to Xcode target), and a screenshot pipeline (`scripts/shots.mjs` + `scripts/frame.mjs`) → 5 dark shots in `screenshots/final/`. All pushed to `main`.
- **Open screenshot decisions (next session):** merge shots 2&3? render 6.9" (1320×2868)? (theme = dark, decided.)

## Previously (Jun 10) — Cloud accounts + UI polish

- Cloud accounts Phase 1–3 (Apple Sign-In, backup/restore, key-stripping + 6 vitest tests). Three branches ready for PR. UI polish (arc label, removed reopen chip, sidebar dedup). See HANDOFF.md §174.

## Pending (priority order)

- [ ] **☁️ Owner setup — Cloud accounts** — Firebase project + .env vars + Apple provider + Services ID + Xcode capability + plist + firestore.rules. Checklist in CLOUD_ACCOUNTS_HANDOFF.md.
- [ ] **Open 3 cloud PRs** (code ready, awaiting `gh auth login`)
- [ ] **App Store:** add `PrivacyInfo.xcprivacy` to Xcode target · age rating · confirm/create ASC app record · finalize metadata + screenshots
- [ ] **TestFlight build 59:** archive in Xcode → App Store Connect
- [ ] On-device pass: cloud accounts (sign-in flow, backup/restore, no Account UI when disabled, API keys not leaked)
- [ ] On-device pass: UI polish (arc label, sidebar blanks, no reopen chip)
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Cloud:** Firebase 12.x (JS SDK) + @capacitor-firebase/authentication 8.3 (Apple Sign-In native sheet iOS, popup web). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache. **Primary LLM:** Gemini REST+SSE. **Routed labs:** OpenRouter. **Single-model only**. **State:** Zustand 5 (chat/drift/model/ui/auth) · **DB:** IndexedDB via idb (v2 schema + users backup). Drift Map = pure SVG + HTML. **Bundle:** manualChunks (vendor cacheable). App.tsx ~3k lines · DriftPanel.tsx ~1.3k.

## Key files

`src/lib/cloudConfig.ts` (gate) · `src/services/firebase.ts` (lazy init) · `src/services/auth.ts` (Apple sign-in) · `src/services/cloudSync.ts` (backup/restore) · `src/services/cloudKeyStrip.ts` (key removal + tests) · `src/components/account/SignInSheet.tsx` · `src/components/account/AccountSection.tsx` · `src/App.tsx` (main integration) · `src/services/gemini.ts` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx`
