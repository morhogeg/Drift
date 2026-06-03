# Drift — Quick Status

**Date:** June 3, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 44 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change you MUST run `npm run build && npx cap sync ios` before Run/Archive in Xcode — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 3 PM) — Bug-fix wave + usability/map + web QA
Ran as 4 parallel agents in isolated git worktrees (sidebar / map / panel / web-QA), merged sequentially with no conflicts.
- **Sidebar overhaul** — new `SidebarChatRow.tsx`: three distinct row types (Chat / Drift / Synthesis) with own icon+treatment; drifts nest under their source chat (resolves up `parentChatId` to root) with a violet rail + `from <parent>` caption. Synthesis detected via `/✦ Synthesis/i` on `lastMessage`.
- **Drift Map (`DriftKnowledgeGraph.tsx`)** — (a) fixed mobile open-then-close: 450ms re-entrancy-guarded toggle + removed `ErrorBoundary onError→close` (boundary was conditionally mounted, yanking the map on any transient throw). (b) Node **lineage**: `<title>` breadcrumb on hover/long-press + breadcrumb trail in DetailCard. (c) Clickable AI terms (`InlineListLink`) now dispatch `drift:start-from-term` → routed to `handleStartDrift`, so they record as map nodes/edges. (d) **At-a-glance** parent-term context label rendered ABOVE each drift node (e.g. `↳ PSG` over the goals question), RTL-safe, parent-hue.
- **Drift panel (`DriftPanel.tsx`)** — Connect/term keying: added `driftChatId` to the init effect deps; `skipStaleCardParseRef` stops the parser keying the old drift's cards onto a newly-selected term; `messagesThreadRef` stamps the loading thread so per-term saves never land under the wrong key. Fixes: Connect showing wrong drift's content, lens/pill out of sync, and per-term conversation vanishing on term switch.
- **Web QA fixes** — added `dummy` (Demo) provider branch in DriftPanel (drifts were throwing "No Gemini key" in keyless Demo mode); `100dvh` viewport (input bar no longer clipped by mobile browser chrome); `navigator.clipboard?.` guard; **removed console statements that logged API keys / full settings** to the browser console.
- **State persistence verified** — per-(term × lens) threads persist + restore across term switches (`navigateToSiblingDrift` → `resolveDriftRestore`) and lens switches (`handleSwitchLens` + `lensRegistryRef`). Connect cards + visited-bridge answers cached in `connectCardsCache`/`connectAnswersCache` + `driftInfos`.

### Roadmap agreed for next sessions (intelligence + usability)
1. **Semantic concept layer (IN PROGRESS)** — `termIndex.ts` matching is lexical only (exact + substring); `SearchModal` is `indexOf`; NO embeddings exist. Add Gemini embeddings (same key, `embedContent`), cache vectors in IndexedDB per `driftChatId`, rank `findRelatedDrifts` by cosine. Upgrades recall + Connect + map edges + search at once. Local Transformers.js fallback noted for keyless/offline.
2. **Continuity / resurfacing** — `lensRegistryRef` is in-memory (lost on reload, rebuildable from `driftInfos`); no "open loops"/resume surface for un-synthesized drift trees.
3. **Discoverability** — drift gesture, lenses, clickable terms, synthesis are all invisible affordances; no first-run teaching. Add on-brand, reduced-motion-aware coachmarks + empty states.

## Earlier Session (Jun 3 AM) — Providers + Settings wave
- **Add Models → 4 frontier labs:** OpenAI · Anthropic · Google Gemini · xAI Grok lead the picker (then OpenRouter/Ollama/Demo under "More options"). OpenAI/Anthropic/Grok route through **OpenRouter** (one `sk-or-…` key) — they block direct browser CORS; their model lists are the live OpenRouter catalog filtered by `openai/`·`anthropic/`·`x-ai/` prefix. **Gemini stays native & untouched.**
- **Settings redesign:** brand-aware luminous glyphs (each lab its own hue, dims when off), softer cards, "N active" header, premium CTA, fixed unrendered panel shadow (Unicode-minus bug).
- **Swipe-to-open-sidebar removed** — collided with text selection / drift tooltip. Close-swipe kept; opens via header menu.
- **Removed Ollama/Qwen3** default presets (seed + migration strips them from saved settings).
- **Lab-key clarity:** routed labs show "via OpenRouter" badge + "OpenRouter API Key" label + a note (native `sk-…` keys won't work there).

## Provider architecture (key context)
OpenAI/Grok = no client-side native keys possible (no CORS; `CapacitorHttp` breaks SSE). Anthropic/Gemini *can* go native (Anthropic needs `anthropic-dangerous-direct-browser-access` header). Current: all 4 as brands, OpenAI/Anthropic/Grok via OpenRouter, Gemini native. Future options open: hybrid (native Anthropic+Gemini) or +proxy (native all 4).

## Pending (priority order)
- [ ] TestFlight: archive build 44 → App Store Connect
- [ ] On-device: providers/settings wave (OpenRouter key streams; Settings; no Ollama/Qwen3; no swipe-open) + content wave (Hebrew)
- [ ] (Optional) native Anthropic+Gemini hybrid
- [ ] Message editing + regeneration (`updateMessage` exists) · Custom system prompts per chat
- [ ] Export & Share (deferred) · Security: client-side key (deferred) · Real auth
- [ ] App.tsx refactor (~3.9k lines) · Voice output · Dead code cleanup

## Stack snapshot
React 19 + TS + Vite 7 + Capacitor 8 + Tailwind (darkMode 'class'). **Primary LLM:** Gemini REST+SSE (native, language-aware, transliterating). **Routed labs + others:** OpenRouter (OpenAI-compatible, streaming). **Local:** Ollama · **Demo:** DummyAI. **State:** Zustand 5 (chat/drift/model/ui) · **DB:** IndexedDB via idb. Drift Map = pure SVG bioluminescent graph. App.tsx ~3.9k lines · DriftPanel.tsx ~1.7k.

## Key files
`src/components/Settings.tsx` (`brandOf`/`ProviderGlyph`, redesign) · `src/components/AddModelSheet.tsx` (LAB_PROVIDERS/MORE_PROVIDERS, brand/backend split, orPrefix) · `src/services/settingsStorage.ts` (defaults + legacy-seed migration) · `src/App.tsx` (`useSwipeGesture` open removed; provider dispatch) · `src/components/DriftPanel.tsx` · `src/components/DriftKnowledgeGraph.tsx` · `src/services/gemini.ts` (`LANGUAGE_DIRECTIVE`)
