# Drift — Quick Status

**Date:** June 8, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 55 (iOS + web) — ready for TestFlight
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ **CRITICAL ACTION REQUIRED:** Rotate both exposed Gemini API keys + raise spend cap in Google AI Studio. See HANDOFF.md entry 164.

## Last Session (Jun 8) — Mobile UX overhaul + audit fixes + bundle optimization

- **Mobile core fixes** — model picker moved from composer to sidebar (less clutter); lens-drift push now works + shows in-panel confirmation + glow reveals on return to main chat; header breadcrumb/pill now flex-shrink to prevent overlapping search icon on narrow phones.
- **Mobile audit (12 fixes)** — keyboard lift via visualViewport fallback (PWA/web); selection bar horizontal scroll (90+ template buttons now reachable); selection bar floats above multi-line composer (ResizeObserver); safe-area sidebar inset; RTL truncation fix (dir="rtl" attr); composer 44px touch targets; footer redesigned to compact icon toolbar (Model pill + Gallery/Help/Settings icons).
- **Bundle optimization** — Vite manualChunks split vendor code into cacheable chunks: react-vendor, markdown, framer-motion, icons, state-vendor. Main chunk 763 kB → 289 kB (gzip 83 kB), >500 kB warning eliminated.
- **Push indication & reveal** — new in-panel "✓ Added to the main thread" confirmation bar in DriftPanel; reveal effect auto-scrolls + applies 2.6s glow when main chat becomes visible. **Build 54→55**, tsc + vite + cap sync clean.

## Pending (priority order)

- [ ] **🔴 Rotate Gemini keys + raise spend cap** (user action, not code) — two keys exposed
- [ ] TestFlight: archive build 55 in Xcode → App Store Connect
- [ ] On-device pass: mobile UX (lens push, footer, header, audit fixes, safe-area, RTL, keyboard lift, selection bar scroll)
- [ ] On-device pass: prior sessions (highlight-menu, map/panel stability, Hebrew content, providers/settings)
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache + semantic recall. **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs:** OpenRouter (OpenAI/Anthropic/Grok streaming). **Single-model only** (broadcast removed Jun 5). **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb (v2 schema). Drift Map = pure SVG + HTML cards (Hebrew-safe). **Localization:** Hebrew + English scaffolding + lens labels. **Bundle:** manualChunks (vendor cacheable). App.tsx ~3.16k lines · DriftPanel.tsx ~1.27k (decomposed into hooks).

## Key files

`src/App.tsx` · `src/components/DriftPanel.tsx` · `src/components/SelectionTooltip.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/hooks/useKeyboardVisibility.ts` · `src/hooks/useDriftPanelActions.ts` · `src/hooks/useConnectThreads.ts` · `src/services/gemini.ts` · `src/utils/rtl.ts` · `vite.config.ts`
