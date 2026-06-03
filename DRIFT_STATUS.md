# Drift — Quick Status

**Date:** June 3, 2026 | **Branch:** `feature/apple-level-overhaul` | **Build:** 44 (iOS + web)
**Repo:** `/Users/morhogeg/Drift` | `npm run dev` · `npm run build && npx cap sync ios`

> ⚠️ iOS bundles a copy of `dist/`. After ANY web change you MUST run `npm run build && npx cap sync ios` before Run/Archive in Xcode — a clean+rebuild in Xcode alone keeps the stale bundle.

## Last Session (Jun 3) — Providers + Settings wave
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
