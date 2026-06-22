# Drift — Quick Status

**Date:** June 22, 2026 | **Branch:** `main` | **Build:** 61 (iOS) · web live on **Vercel**
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`
**Live web:** https://drift-one-jade.vercel.app — auto-deploys on push to `main` (Vercel Hobby, BYOK, no key in bundle)

## Last Session (Jun 21–22) — Public Vercel launch + free "on us" demo

- **Vercel hosting + security:** connected the repo to Vercel; verified BYOK posture (no secrets committed, no key in the prod bundle, strong build-time CSP). No `vercel.json` / env vars needed.
- **Free "on us" examples (keyless, zero API calls):** the 4 welcome example prompts ship pre-written answers; each of the 12 pre-marked terms has pre-written content for **all six lenses** — Drift, Simplify, Deep dive, Stress test, Evidence, and Connect (cards + a bridge answer per card). Content in `src/lib/freeExamples.ts` + `src/lib/freeLensContent.ts`; served from `useMessageStream` / `useDriftMessageStream` / `DriftPanel` only when keyless on a fresh thread.
- **Examples persist** on the welcome screen until the user brings their own key (`hasOwnKey`); **Settings no longer auto-opens** on a missing key; challenger-picker bypassed for the keyless Stress-test lens.
- **Tooltip fixes:** welcome-card capability tooltip moved below the cards (was clipping the top toolbar) and de-animated; the highlight **selection menu** now uses an opacity-only fade (no left-flash jump) and positions from its **real measured height** so it never clips at any selection position.
- **PR housekeeping:** merged 6 green PRs (#11/#12/#13 CI actions, #30 19-pkg group, #18 globals, #15 react-syntax-highlighter) and upgraded to **ESLint 10** (with eslint-plugin-react-hooks 7 + flat-config fix; closed #16/#17). `tsc` clean, build green, 38/38 tests.

## Pending (priority order)

- [ ] **PR #31 reconcile** — "Onboarding wow + key-at-need" duplicates the free-examples demo (seeds a sample Rome exploration). Held open. Suggested: keep its `ApiKeyPrompt` "key-at-need" modal, drop the redundant seeded sample.
- [ ] **TestFlight build 61:** archive in Xcode → App Store Connect (iOS path, unchanged this session)
- [ ] **App Store:** `PrivacyInfo.xcprivacy` in Xcode target · age rating · ASC app record · metadata + screenshots
- [ ] **☁️ Owner cloud setup** — Firebase project + `.env` vars + Apple provider + Services ID + Xcode capability + plist + `firestore.rules`
- [ ] On-device pass · semantic map TODO (Connect-lens seeding + persist composite lens-thread state) · message editing + regeneration · custom system prompts · export & share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Web host:** Vercel (push-to-deploy). **Cloud:** Firebase 12.x + @capacitor-firebase/authentication 8.3 (Apple Sign-In; native iOS / popup web). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache. **Primary LLM:** Gemini REST+SSE with Google Search grounding. **Routed labs:** OpenRouter. **Single-model only.** **State:** Zustand 5 (chat/drift/model/ui/auth) · **DB:** IndexedDB via idb. Drift Map = SVG + HTML. **Tooling:** ESLint 10 (flat config, lint advisory in CI), react-syntax-highlighter 16. App.tsx ~3.5k lines · DriftPanel.tsx ~1.3k.

## Key files

`src/App.tsx` (main integration; welcome/examples ~line 2370, `hasOwnKey`) · `src/lib/freeExamples.ts` + `src/lib/freeLensContent.ts` (free "on us" content + helpers) · `src/hooks/useMessageStream.ts` + `src/hooks/useDriftMessageStream.ts` (canned interception) · `src/lib/driftPanel.ts` (lens prompts + scaffold detection) · `src/services/gemini.ts` (Gemini stream + grounding) · `src/components/DriftPanel.tsx` · `src/components/SelectionTooltip.tsx` (highlight menu) · `src/components/DriftKnowledgeGraph.tsx`
