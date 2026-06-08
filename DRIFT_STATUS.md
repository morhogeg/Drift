# Drift — Quick Status

**Date:** June 8, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 54 (iOS + web) — ready for TestFlight
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ **CRITICAL ACTION REQUIRED:** Rotate both exposed Gemini API keys + raise spend cap in Google AI Studio. See HANDOFF.md entry 164.

## Last Session (Jun 8) — Highlight-menu redesign + unified color system + side-chat fixes

- **Highlight menu** — unified Lucide icon set (Simplify `Lightbulb`, Deep dive `Telescope`, Connect `Waypoints`, Challenge `Scale`); per-action signature colors via `ACTION_TINT`; primary relabeled "Drift into"; Save tinted violet; pairs split by a divider.
- **Pushed-drift text now selectable** — the bubble's click-to-open hijacked drag-selections; guarded `onClick` to bail when a selection is active, so the drift/save tooltip works on pushed text.
- **Tooltip flicker fixed** — desktop `handleMouseMove` kept open while a non-collapsed selection exists (was dismissing on cursor geometry).
- **Sibling term strip** — added click-and-drag horizontal scroll (`cursor-grab`, pointer capture) with a `dragged` guard so dragging never switches drifts.
- **Color consistency** — removed the redundant Connect legend; "View as" lens bar active state now per-lens (Connect cyan = matches its page); Connect "tap a connection" hint localized (He/En). tsc + vite + cap sync clean; **Build 53→54**.

## Pending (priority order)

- [ ] **🔴 Rotate Gemini keys + raise spend cap** (user action, not code) — two keys exposed
- [ ] TestFlight: archive build 54 in Xcode → App Store Connect
- [ ] On-device pass: verify highlight-menu colors/labels, pushed-text selection, lens-bar tints, drag-scroll chips, Hebrew Connect hint
- [ ] **TODO(semantic):** Connect-lens seeding + semantic edges on map; persist composite lens-thread state
- [ ] Message editing + regeneration · Custom system prompts · Export & Share
- [ ] Real auth · Security: key behind proxy · Light theme polish
- [ ] Voice output · Code cleanup (dead DriftMapPanel, dormant forest scope, debug logs)

## Stack snapshot

React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Embeddings:** Gemini `gemini-embedding-001` (768-dim) → IndexedDB vector cache + semantic recall. **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs:** OpenRouter (OpenAI/Anthropic/Grok streaming). **Single-model only** (broadcast removed Jun 5). **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb (v2 schema). Drift Map = pure SVG. **Localization:** Hebrew + English scaffolding. App.tsx ~3.16k lines · DriftPanel.tsx ~1.27k (decomposed into 4 hooks + lib/driftPanel).

## Key files

`src/components/SelectionTooltip.tsx` · `src/hooks/useDriftPanelActions.ts` · `src/hooks/useConnectThreads.ts` · `src/hooks/useDriftMessageStream.ts` · `src/lib/driftPanel.ts` · `src/services/embeddings.ts` · `src/lib/semanticRecall.ts` · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/services/db.ts` (v2) · `src/App.tsx`
