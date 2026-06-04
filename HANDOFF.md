# Drift — Session Handoff

**Date:** June 4, 2026
**Branch:** `feature/apple-level-overhaul`
**Build:** 51 (iOS Xcode) / web
**Status:** This session (Jun 4) — prepared build 51 for TestFlight (bundle unchanged from build 50). Build 50 had three on-device bug fixes, entries 158–161: map "Open drift" losing answer (+ reload durability); synthesis "Next" now clickable; lens labels + Connect bridge question localized to chat language (Hebrew/English). Prior session (Jun 3 PM, entries 150–157): sidebar redesign; Drift-Map fixes (mobile open/close, lineage, clickable-term nodes); Connect/lens/state-persistence fixes; web-QA fixes; **semantic embeddings layer**; continuity (resume surface); discoverability coachmarks. (Bundle: index ~806 kB / gzip ~241 kB.) Earlier context — Five waves. (A) Screenshot polish. (B) Reliability. (C) Connect redesign — relationship typing, alive hub/edges, RTL. (D) Content-quality + map-quality — transliteration, map bridge-node opens conversation, meaningful map labels, filter redesign, full generation-prompt rewrite. (E) Providers + Settings wave — Add-Models reorganised around the 4 frontier labs (OpenAI/Anthropic/Gemini/Grok; OpenAI/Anthropic/Grok routed through OpenRouter, Gemini stays native & untouched), Settings screen redesigned (branded luminous glyphs, softer cards), swipe-to-open-sidebar removed (collided with text selection), Ollama/Qwen3 default presets removed. (Bundle: index ~787 kB / gzip ~235 kB.)

## ⚠️ Provider architecture (important context for next session)
- **Why OpenAI & Grok route through OpenRouter, not native keys:** they block direct browser/webview calls (no CORS). `CapacitorHttp` can't rescue this — it doesn't support SSE streaming (falls back to webview → CORS again). So a pure client app **cannot** stream from OpenAI/Grok with native keys. Anthropic & Gemini *can* go native (they allow CORS; Anthropic needs header `anthropic-dangerous-direct-browser-access: true`). Current choice: **all four presented as brands, OpenAI/Anthropic/Grok routed via OpenRouter (one `sk-or-…` key), Gemini native.** Open future options: hybrid (native Anthropic+Gemini) or +proxy backend (native all 4). User chose to leave as-is for now.
- Branded labs are stored as `provider: 'openrouter'` presets with model ids `openai/* · anthropic/* · x-ai/*`; the live OpenRouter catalog is filtered by that prefix so line-ups never go stale. No dispatch changes — existing OpenRouter streaming path runs them.

---

## What Was Done This Session

### 161. Connect bridge question — localized to chat language (FIX, build 50)
- The Connect bridge question was still hardcoded English (`How does "X" connect to Y?`) → mixed LTR/RTL in Hebrew chats (per TestFlight screenshot). Added `bridge` to `DriftLabels` (EN/HE: `איך "X" קשור ל-Y?`); `bridgeQuestion()` now uses it; the connect-card tooltip uses the localized question too.
- **Critical companion fix:** two regexes detect a bridge thread by the English "connect to" text — `App.tsx` `bridgeUserMsg` (sets `connectQuestion` on open) and `DriftKnowledgeGraph.tsx` `nodeTopic` (map "X → Y" label). Both now also match the Hebrew `קשור ל-` form, so a localized bridge still opens as a conversation (not the cards list) and still labels correctly on the map. English alternation kept for back-compat with already-created bridges.

### 160. Map "Open this drift" bug — losing the answer (FIX)
- **Root cause:** Drift sessions registered into `chatHistory` at first-message (question only); answer only lived in temp store. `onOpenDrift` wrongly preferred the stale chatHistory snapshot over the fuller temp store.
- **Fixes:** (a) `onOpenDrift` + `resolveDriftRestore` now pick the FULLEST of three sources (ensures answer comes back). (b) Added debounced flush of growing drift conversation into chatHistory/IDB (survives reload; was in-memory only). `App.tsx`: new `driftPersistTimerRef`, 700ms debounce on each incoming message.

### 159. Synthesis "Next:" is now clickable (FEATURE)
- Extract the `**Next:**` open question from synthesis prose using a regex, strip it from the body (no duplication), render as a dedicated "Explore next" chip with the question text. Tap sends it as a real LLM call (`sendMessage` now accepts optional override text). RTL-aware (Hebrew question renders correctly).

### 158. Lens labels localized to chat language (FEATURE)
- Drift scaffolding (the opener + "Simplify this" / "Deep dive into this" / etc.) is now localized: Hebrew chat gets Hebrew labels, English chat gets English. Detected by script (Hebrew range `[֐-׿]`) sampled from the term + recent parent messages.
- **New module-level helpers:** `DRIFT_LABELS_EN` / `DRIFT_LABELS_HE` dicts, `driftLabelsFor()` sampler, `isDriftOpenerText()` / `isDriftScaffoldText()` predicates. All four internal filters that strip scaffolding from the API conversation now use language-agnostic predicates (so localizing doesn't leak the opener or create duplicates in pushed drifts). Hebrew labels: `opener`, `connectFinding`, `prefixes` dict.
- (Bundle: index ~806 kB / gzip ~241 kB — minimal change.)

### 157. Discoverability — one-time coachmarks (FEATURE)
- New `src/lib/onceFlags.ts` (`hasSeen`/`markSeen` + `useOnceFlag` hook, localStorage-backed, fails safe to "seen"). Two first-run hints for invisible affordances: (a) `App.tsx` — a drift-gesture pill above the composer once a reply is on screen, auto-dismissed forever the first time any drift opens; (b) `DriftPanel.tsx` — a lens-switcher hint under the "View as" bar, dismissed on first lens use. Map already had a teaching empty state — left as-is.

### 156. Continuity — survive reload + "pick up where you left off" (FEATURE)
- `App.tsx`: effect rebuilds the in-memory `lensRegistryRef` from persisted `driftInfos` on load, so per-term/lens threads survive a reload. New `resumableTrees` memo surfaces un-synthesized trees (≥2 real drifts) as resume cards in the empty state — tap switches to the chat, "✦ Bring it home" triggers `handleSynthesize`. (Composite `{id}__connect` lens-thread connect-state is still in-memory only — survives session, not reload; minor follow-up.)

### 155. Semantic concept layer — Gemini embeddings (FEATURE / INTELLIGENCE)
- The knowledge layer was lexical-only (`termIndex.findRelatedDrifts` exact+substring; `SearchModal` `indexOf`). Added meaning-based recall reusing the existing Gemini key (no new service):
  - `src/services/embeddings.ts` — `embedTexts` (model `gemini-embedding-001`, 768-dim via `outputDimensionality`, batch `:batchEmbedContents`, AbortController+timeout, graceful `[]` on any error) + `cosineSimilarity`.
  - `db.ts` — DB_VERSION 1→2, **additive** `drift-embeddings` store (guarded `oldVersion < 2`, chats untouched) + `embeddingDB` CRUD.
  - `src/lib/embeddingBackfill.ts` — debounced fire-and-forget backfill, djb2 content-hash so it re-embeds only on change, in-memory cache.
  - `src/lib/semanticRecall.ts` — merges lexical-first + semantic neighbors (threshold 0.62), returns `TermOccurrence[]` (no consumer shape change).
  - Wiring: `App.tsx` "you explored this before" (`relatedDrifts` shows lexical instantly, semantic fills in) + `SearchModal` "Related by meaning" section.
  - **Degrades to lexical with no key / Demo / offline.** Live test (`scripts/test-embeddings.mjs`): sim(Messi, "Argentine forward")=0.75, sim(Messi, PSG)=0.64, sim(Messi, photosynthesis)=0.49 → PASS.
  - `// TODO(semantic):` seams left in `DriftPanel.tsx` (Connect-lens seeding) + `DriftKnowledgeGraph.tsx` (semantic map edges) — deliberately out of scope.

### 154. Web QA — keyless Demo + mobile-web fixes (FIX)
- `DriftPanel.tsx`: added the `dummy` (Demo) provider branch — drifts were throwing "No Gemini key" in keyless Demo mode; `App.tsx` `selectedProvider` resolver now passes `'dummy'` through. `index.css`: `100dvh` (input bar no longer clipped by mobile browser chrome). `SnippetGallery.tsx`: `navigator.clipboard?.` guard (non-HTTPS). Removed `console.log`s that leaked the API key / full settings (`DriftPanel.tsx`, `settingsStorage.ts`).

### 153. Drift panel — Connect keying, lens/pill sync, per-term persistence (FIX)
- Root cause: the init effect was missing `driftChatId` in its deps, so switching terms left the previous term's Connect cards/messages mounted (Barcelona header showing Inter Miami's cards). Added `driftChatId` to deps (authoritative identity → header+messages+Connect reset together); `skipStaleCardParseRef` stops the parser keying the old drift's cards onto a new term; `messagesThreadRef` ensures per-term saves never land under the wrong key (fixes the "previous question vanished" symptom). Verified per-(term×lens) state persists across term switches (`navigateToSiblingDrift`→`resolveDriftRestore`) and lens switches (`handleSwitchLens`).

### 152. Drift Map — lineage + clickable-term nodes (FIX / FEATURE)
- `DriftKnowledgeGraph.tsx`: node `<title>` carries the full breadcrumb (Messi → PSG → goals) on hover/long-press; DetailCard shows a breadcrumb trail; plus an **at-a-glance** parent-term context label rendered above each drift node (e.g. `↳ PSG` over the goals question), RTL-safe, parent-hue. `InlineListLink.tsx`: clickable AI terms now dispatch `drift:start-from-term` → routed through `handleStartDrift`, so they record as real map nodes/edges (previously they only scrolled).

### 151. Drift Map — mobile open-then-close fix (FIX)
- Two compounding causes: the toggle double-fired (framer-motion tap + synthesized click flipped state twice), and the `ErrorBoundary` was conditionally mounted with `onError → close`, so any transient throw yanked the map shut on open. Fixed with a 450ms re-entrancy-guarded `toggleKnowledgeGraph` (reads live state via `getState`) and removed the auto-close-on-error (boundary now contains errors in place).

### 150. Sidebar — differentiate chats / drifts / synthesis (DESIGN)
- New `src/components/SidebarChatRow.tsx` + a grouping pass in `App.tsx`. Three distinct row types (Chat / Drift / Synthesis) each with its own icon + treatment; drifts nest under their source conversation (resolves up `parentChatId` to root) with a violet rail + `from <parent>` caption; synthesis detected via `/✦ Synthesis/i` on `lastMessage`. Search / rename / context-menu / pin all preserved.

### 149. Settings — remove Ollama/Qwen3 default seeds + lab-key clarity (FIX)
- `settingsStorage.ts`: dropped the default `ollama` (llama2) and `qwen3` presets from `defaultSettings.modelPresets`, AND added a migration in `get()` that strips `LEGACY_DEFAULT_PRESET_IDS = {ollama, qwen3}` from already-saved settings (stable ids; user-added Ollama/OpenRouter models get slugged ids so they're untouched). Ollama still available via "More options".
- `AddModelSheet.tsx`: made the OpenRouter-key requirement for routed labs unmistakable — a **"via OpenRouter"** badge by the lab name, the field relabelled **"OpenRouter API Key"**, and a note: "{lab} is reached through OpenRouter — paste your OpenRouter key (sk-or-…), not a native {lab} key." (Pasting a native `sk-…`/`sk-ant…` key in a routed lab would fail validation.)

### 148. Swipe-to-open-sidebar removed (FIX)
- A horizontal drag in the chat to select text was being read as an open-sidebar swipe, hijacking the drift selection tooltip. `useSwipeGesture` in `App.tsx` now passes `undefined` for the left/open callback; swipe-right-to-close is kept (no collision — no text selection while the sidebar is open). Sidebar still opens via the header menu button.

### 147. Settings screen redesign (DESIGN)
- Reworked within the canonical `DESIGN_SYSTEM.md` ("light from within"), not the frontend-design skill, to stay on-brand. New **brand-aware luminous glyphs** (`brandOf` + `ProviderGlyph`): each preset emits its lab's hue (OpenAI emerald, Anthropic Claude-clay #d97757, Grok near-white, Gemini sky, OpenRouter indigo, Ollama green, Demo violet), dimming when toggled off — this also visually distinguishes OpenAI/Anthropic/Grok even though they share the OpenRouter backend. Softer group cards (gradient surface, faint hairlines, rounded-2xl), refined section headers with an "N active" count, taller tappable rows, premium "Add a model" CTA, polished empty state, larger title + circular close button. Fixed a latent bug: panel drop-shadow used a Unicode minus (`−`) so it never rendered → real `-20px`. "Dummy AI" → "Demo AI".

### 146. Add Models — the four frontier labs (FEATURE)
- `AddModelSheet.tsx` reorganised: `LAB_PROVIDERS` (OpenAI · Anthropic · Google Gemini · xAI Grok) lead, then `MORE_PROVIDERS` (OpenRouter full search · Ollama · Demo). Introduced a brand/backend split: `ProviderMeta.id` is the UI brand, `ProviderMeta.backend` is the actual `Provider` stored on the preset. OpenAI/Anthropic/xAI use `backend: 'openrouter'` + an `orPrefix` (`openai/`·`anthropic/`·`x-ai/`); their model list is the **live OpenRouter catalog filtered by prefix** (never stale). Gemini path is byte-for-byte unchanged (native, `checkGeminiConnection`, `GEMINI_OPTIONS`). No new `Provider` union members → no dispatch/Settings changes; existing OpenRouter streaming path runs the routed labs. Research-backed: confirmed OpenAI has no browser CORS, Anthropic/Gemini do, Grok unclear, `CapacitorHttp` breaks SSE.

### 144. Content-generation quality — full prompt rewrite (QUALITY)
- Audited and rewrote every AI-generation surface for context-grounding, user-intent fidelity, and anti-generic output, within the existing parse contracts:
  - **`gemini.ts`**: `getSuggestedHighlights` (pick rich "doorway" phrases — proper nouns / terms of art / load-bearing concepts, strict verbatim-substring, temp 0.3, ban generic verbs & whole clauses), `getDriftSuggestions` (context-grounded, banned its own generic example templates, demands two distinct angles, role-labeled last-4 context), `getConnections` (disambiguation + grounded "back" links + cross-domain, context budget 1200→2000), `synthesizeDrifts` (honesty guard — don't force false connective tissue / invent facts).
  - **`DriftPanel.tsx`**: rewrote `TEMPLATE_SYSTEM_PROMPTS['simplify']` (one vivid analogy, smart-adult tone, aim for the "aha", ~120 words) and `['research']` (Deep dive — expert depth, mechanism/history/live-debates, specific names+dates, honest about contested points, skimmable); sharpened the Connect Rules (specific verifiable concepts, ≥1 tension, no duplicates/near-synonyms, no hallucination); rewrote the Connect bridge-answer prompt to demand the actual *link* (through-line / shared mechanism / influence / tension), lead with the surprising part, keep the term in frame; widened `parentContext` 6→8 messages with a 1200-char per-message cap.
  - **Latent bug fixed**: the multi-model *compare* path ignored `parentContext` entirely and used the weakest generic prompt → ungrounded answers that could disambiguate the term differently per model. Now uses the same context-grounded prompt as the single-model path.

### 143. Map — meaningful node & pill labels, not "Barcelona 1/2/3" (FIX)
- `nodeTopic` rewritten with a real priority chain: Connect bridge (`term → Y`) → genuine user question → **gist of the first real answer** (markdown/JSON stripped, first clause, iOS-15-safe: no regex lookbehind) → bare term only as last resort. So multiple lenses on one term (Simplify / Deep dive / Connect) now read by what they actually explored instead of a meaningless counter.
- `collectTopics` (the EXPLORED strip) now uses `nodeTopic` too, so the top-of-map pills are meaningful as well. `disambiguateTopics` kept as a final safety net. Graph labels truncate at 24, pills at 20, detail card wraps.

### 142. Map — filter field redesign (POLISH)
- Fixed-height pill (34px) aligned with the recenter button; stable width (removed the jarring focus-expand); `dir="auto"` so Hebrew/Arabic queries align RTL; cleaner clear-button hit target. `.dkg-search` padding + recenter button bumped to match heights.

### 141. Language — transliterate proper nouns + map bridge open (BUG FIX)
- **Transliteration**: `LANGUAGE_DIRECTIVE` (`gemini.ts`) used to say "keep proper nouns in their original script" — that's why a Hebrew chat showed "Johan Cruyff"/"Real Madrid"/"Catalan Nationalism" in Latin. Now it requires writing every proper noun in the conversation's OWN script (Hebrew chat → "יוהאן קרויף", "ריאל מדריד", "לאומיות קטלאנית"), only code/URLs/units stay Latin. Connect `<concept>` rule updated to match.
- **Map bridge open**: the Drift Map's "Open this drift" on a Connect *bridge* node ("ברצלונה → Johan Cruyff") dropped back to the connections cards screen instead of the bridge conversation. `onOpenDrift` (`App.tsx`) now detects a bridge thread (a user "…connect to Y" message in the node), passes its real messages + `connectQuestion` so DriftPanel opens the chip-chat answer view; the connections-LIST drift still opens clean (cards). Added `Message[]` resolution that's shared between the two paths.

### 140. Connect — relationship taxonomy + living map redesign (REDESIGN)
- Reworked the Connect lens card list (`DriftPanel.tsx:1290–1380`) from a flat uniform list into a **semantic relationship map** with live visual distinction:
  - **Relationship typing (language-agnostic):** Updated the Connect prompt to return `"<type> :: <relationship> :: <concept>"` where `<type>` is a language-invariant keyword (`origin·identity·influence·tension·history`) classifying the KIND of link. New module-scope `CONNECT_TYPES` registry maps each kind → hue + lucide icon. Parser remains backward-compatible with legacy 2-part (`"relationship :: concept"`) and bare-concept cached cards.
  - **Color + icon chips:** Each card now displays a leading icon chip (Landmark / Fingerprint / Sparkles / Swords / Clock) in its kind's hue (`origin`=#34d399 green, `identity`=#22d3ee cyan, `influence`=#a78bfa purple, `tension`=#fb923c warm amber, `history`=#fbbf24 yellow). `tension` edges use a dashed connector so opposition visually contrasts against the cool field. The type legend appears in the footer so the user understands the taxonomy.
  - **Alive hub + edges:** Hub node now breathes (`animate-breathe`); each edge has a glowing type-colored synapse dot on the rail (`box-shadow: 0 0 8px ${glow}`, `hover:scale-150`). Explored edges light up in their type color (the "where you've been" trail).
  - **RTL fix:** Whole block uses `dir={getTextDirection(selectedText)}` + logical Tailwind props (`border-s`/`ps-5`/`-start-*`/`text-start`/`ms-[6px]`) so the rail + arrows mirror for Hebrew and other RTL languages. Arrow icon swaps to `ArrowUpLeft` when `dir === 'rtl'`. Confirmed all logical utilities compiled into the bundle CSS.
  - **Dead space:** First-visit hint line ("Tap a connection to explore the bridge") + inline type legend (`presentKinds` footer chips) fill the lower area.
- Build + `npx cap sync ios` ✅; tsc + Vite clean; logical properties compile correctly. Not yet eyeballed on-device (needs a live Gemini call to populate cards with typed responses).

### 139. Drift Map — scoped error boundary + data hardening (BUG FIX / RESILIENCE)
- Intermittent WebKit-only crash on map open (`TypeError: null is not an object (evaluating 'O.current…')`) was hitting the APP-ROOT error boundary → full-page "Something went wrong / Refresh". Wrapped `<DriftKnowledgeGraph>` in a scoped `ErrorBoundary` (`fallback={null}`, `onError` closes the map) so a map failure can no longer take down the whole app — it auto-recovers and a re-tap remounts fresh. `ErrorBoundary` extended with optional `fallback`/`onError` and now logs the component stack via `componentDidCatch`.
- Hardened render-phase node helpers (`nodeTopic`, `lastAiPreview`) against missing `chat.messages`.
- Root cause not isolated from source (every map `.current` deref is guarded; not a hooks violation; did not repro in Playwright WebKit with real drifts). Next step if it recurs: read the component stack via Safari Web Inspector on-device.

### 138. No redundant LLM calls when re-opening an explored term+lens (BUG FIX)
- Re-opening an already-generated drift (header reopen pill, sibling switcher, "Drift into" chips, inline links, map) was re-firing a new generation because the entry point opened the drift without the saved content/`templateType`, so DriftPanel's auto-send wasn't suppressed.
- Added centralized `resolveDriftRestore(driftChatId, sourceMessageId, selectedText, parentMessages?)` in App.tsx — single source of truth returning `{ existingMessages, templateType, connectCards, connectAnswers }` from temp store + `connectCardsCache`/`connectAnswersCache` + the message's `driftInfos`. Wired into `reopenLastDrift`, `navigateToSiblingDrift`, and `handleStartDrift`'s open path; entry points reuse the existing `driftChatId` instead of minting a new one.
- DriftPanel backstop: init effect now sets `autoSentRef.current = true` whenever restored messages OR connect cards OR connect answers exist → an explored combination can never re-fetch; first-time generation still fires once.

### 137. Drift Map — "Open this drift" restores the real drift (BUG FIX)
- Map `onOpenDrift` (App.tsx) reopened Connect-lens drifts blank (just the term) because it never passed `templateType: 'connect'` or cached `connectCards`/`connectAnswers`. Now resolves them (via the same caches + `driftInfos`) and restores the already-generated content — no new LLM call. Connect nodes pass `existingMessages: []` (prose would poison the JSON card parser).

### 136. Connect — lens-switch "No connections found" fix (BUG FIX)
- Term → Connect → Deep dive → Connect again showed "No connections found." The card-parse effect ran on a render where `driftOnlyMessages` still held the previous lens's PROSE answer, failed `JSON.parse`, and wiped the restored cards to `[]`. Now it only parses when the text looks like a JSON array (`startsWith('[')`) and never blanks existing cards on parse failure.

### 135. Language matching — AI output follows the user's language (NEW, Gemini)
- Added exported `LANGUAGE_DIRECTIVE` in `gemini.ts` instructing the model to write all output (responses, suggestions, questions, labels, JSON values) in the user's/source language (Hebrew→Hebrew, English→English…). Wired into `sendMessageToGemini`'s system instruction (covers main chat + every drift) and the four standalone helpers (`getSuggestedHighlights`, `getDriftSuggestions`, `getConnections`, `synthesizeDrifts`). Gemini-only by request (OpenRouter/Ollama untouched).

### 134. Drift Map — informative node preview for Connect drifts (FIX)
- The map only read `driftStore.getTempConversation`, so Connect-lens drifts (whose Q&A lives in `connectAnswersCache` / parent `driftInfos.connectAnswers`) showed "0 msgs" and a blank preview card. `getTempMessages` now falls back to the connect-answers cache and the parent message's `driftInfos.connectAnswers`, so the node gets real message count + an answer-snippet preview.
- `DetailCard` title now uses `nodeTopic()` for drift nodes → shows the actual connection ("Juventus → Industrial Turin Identity") instead of the bare term.

### 133. "Drift into" suggestion chips — polish (POLISH)
- Label moved to its own line (uppercase section header) so wrapped chip rows align cleanly to the left (was inline with the first chip → ragged wrap).
- Roomier even grid (`gap-2`), larger tap target, subtle shadow, clearer hover/active, and a per-chip `↗` (ArrowUpRight) affordance that brightens on hover. Long terms truncate via `max-w-full` + `truncate`.

### 132. Drift Map — full-screen tap-to-preview explorer (REDESIGN)
- Mobile map is now **full-screen** (`fixed inset-0`), not an 88dvh bottom-sheet drawer — removed drag handle, rounded top, and dimmed backdrop; header gets a safe-area top inset.
- **Tap = preview, not jump:** tapping a node only selects + centers it (shows the detail card); navigation is a deliberate second step via the card's "Open this drift / Go to chat" button. Enter/Space still opens fully; arrow keys move + preview. EXPLORED chips also preview (select) instead of navigating away.
- **Removed the All / This chat scope toggle** — the map is always scoped to the current conversation (`scope` fixed to `'chat'`; toggle + `conversationCount` removed).

### 131. Drift Map — meaningful node labels (FIX)
- Nodes previously all showed the bare selected term (e.g. three identical "Barcelona"). Added `nodeTopic()` (surfaces the Connect bridge target / first real question, falls back to the term) + a per-node `labelById` map that runs `disambiguateTopics` so siblings stay distinct.

### 130. Drift synthesis — truncation fix (BUG FIX)
- `synthesizeDrifts` ran `gemini-3.5-flash` (a thinking model) with `maxOutputTokens: 1000`; reasoning tokens consumed the budget and the synthesis cut off mid-sentence (stray unclosed `**`). Raised to 4096 so the ~350-word answer completes and closes its markdown.

### 129. Synthesis message — polished card (POLISH)
- Synthesis messages (`id` starts with `synth-`) now render in a `.synthesis-card`: violet gradient border, soft glow, gradient title — reads as a deliberate artifact, not a stray message.

### 128. Horizontal text cutoff — app-wide fit fix (BUG FIX)
- Chat content (incl. synthesis) overflowed the right edge / was cut off. Root cause: the main chat column was `flex-1` without `min-w-0`, letting content widen past the viewport. Added `min-w-0` to the main column, `overflow-x: hidden` + `max-width:100%` on `.chat-messages-container`, and `overflow-wrap: anywhere` / `word-break` on `.ai-message`/prose (with code blocks/tables getting their own scroll). Added `min-w-0` on the message bubble too.

### 127. Connect — context-aware disambiguation (FIX)
- Connect ignored conversation context: "Barcelona" in a Messi thread returned city-of-Barcelona connections (Gaudí, Modernisme…). Connect prompt now gets a hard "DISAMBIGUATE BY CONTEXT" instruction that forces the term to be read through the surrounding conversation (FC Barcelona the club, not the city). Removed a latent double-append of context for Connect.

### 126. Term selection action bar — professional redesign (POLISH)
- The iOS selection bar (Drift / Simplify / Deep dive / Connect / Save) was cramped ("Deep dive" wrapped to two lines) with a cyan/violet/blue rainbow. Replaced emoji with consistent Lucide icons (BookOpen / Telescope / Link2), switched templates to a calm uniform icon-over-label layout (no wrap), kept Drift as the single gradient primary, and unified colors/dividers/padding into one polished control. Desktop tooltip updated to icons too.

### 125. Lens switcher — preserve Connect state across switches (FIX)
- Cache connect cards + visited-bridge answers per thread-id (`connectCardsCache` + new `connectAnswersCache`). Switching back to a Connect view restores its map AND tapped-connection indicators. Connect targets start with clean messages so bridge prose can't poison the JSON card parser.

### 124. Drift panel — "View as" lens switcher (NEW)
- A "View as" strip in the panel header re-views the SAME term through any lens (Drift / Simplify / Deep dive / Connect) without returning to the chat. Fixes terms being locked to their first action. Each lens keeps its own in-session thread via a per-term registry (`lensRegistryRef`, baseKey `msgId::term` → template → driftChatId); the original chat-linked thread is preserved at its id. Hidden inside Connect's bridge sub-mode.

### 123. Connect view → relationship map + bridge-maker (REDESIGN)
- Connect is no longer "more suggestions" (which duplicated the drift screen). The term is a hub with labeled relationship edges to related concepts; tapping an edge opens a thread where the AI draws the bridge between the two. "Connect to anything…" input bridges to any typed concept.
- Connect system prompt now returns `"<relationship> :: <concept>"` pairs (connectCards stays `string[]`; old bare-string cards still render). Bridge questions ride the existing `connectQuestion` flow (display + prompt). Removed dead `getConnections`/`connections` machinery.

### 122. Connect view — forward-only "Drift ideas" list (REDESIGN, superseded by #123)
- Removed both backward-looking sections ("You explored this before" + "How this relates to where you've been"). Connect is now purely about where to go next.
- Merged "Directions you could drift" + "Explore from here" into ONE deduped list of tappable doorways (questions first, sharper angles below), each opening a focused thread, with `↗` → cyan visited-dot. Prior-drift context still feeds the AI prompt; it's just no longer shown as a block.
- Removed now-unused imports/props (`Reveal`, `History`, `Compass`, `CornerUpLeft`, `onOpenRelatedDrift` destructure).

### 121. Conversation forking (NEW)
- Fork button (GitBranch) on AI messages → `handleForkChat`: creates a new sibling conversation carrying everything through that point (drift markers cleared), switches to it. `metadata.forkedFrom` / `forkedAtMessageId` link back. "What if I'd asked X instead?"

### 120. Suggested next terms — "Drift into" chips (NEW)
- Chip row under each AI answer from unexplored `suggestedHighlights` (already highlighted inline; now also explicit one-tap drift chips).

### 119. Drift Map — keyboard navigation + filter box (NEW)
- Arrow keys walk node→node spatially, Enter/Space opens, view re-centers on selection. Floating filter input dims non-matching nodes; Enter jumps to first match.

### 118. Full-text search across all chats + drifts (NEW)
- `SearchModal.tsx` command palette (⌘K): searches every message in every conversation/drift, ranked, keyboard-navigable, jumps + highlights. Header search button added.

### 117. Drift synthesis — "bring it home" (NEW)
- `synthesizeDrifts()` in gemini.ts weaves every descendant drift of a conversation into one markdown synthesis. Synthesize bar in the Drift Map (chat scope, ≥2 drifts) posts it back on the conversation and scrolls to it.

### 116. Global "All explorations" map (NEW)
- `DriftKnowledgeGraph` scope toggle **This chat / All**; "All" builds a synthetic super-root forest (`buildForest`) of every conversation. Node activation now keys off `isDrift` (drift→panel, chat→switch), not depth.

### 115. Model-agnostic Add Model flow (REDESIGN)
- `AddModelSheet` rebuilt provider-first: pick provider (Gemini / OpenRouter / Ollama / Demo) → connect (API key or server URL, validated) → choose model(s). OpenRouter & Ollama fetch live model lists (searchable) + accept custom IDs. Outputs generic `ModelPreset[]`. Aligned provider dot colors across picker/pill/settings.

### 114. Always-visible breadcrumb in main header (NEW)
- When the active chat is a drift, the header shows the full path `root › term › term` (was only inside the drift panel); each crumb taps to that chat and scrolls to the branch point.

### 113. Lateral term-walking — sibling switcher (NEW)
- Sibling strip under the drift-panel header: prev/next + scrollable pills of every term branched from the same parent; walk term→term in place, active pill auto-scrolls into view.

### 112. Reopen-last-drift pill scoped to active chat (BUG FIX)
- The header reopen pill leaked a stale drift from another conversation onto a fresh chat. Now gated on `lastDrift.parentChatId === activeChatId`.

### 111. iOS bundle staleness resolved (INFRA)
- Confirmed iOS loads bundled `dist/` (no live-reload server). Stale May 31 bundle was being rebuilt by Xcode; `npm run build && npx cap sync ios` now required after web changes. Build bumped to 35.

### 110. Drift Tree — card tap opens existing drift correctly on mobile (BUG FIX)
- Replaced `handleStartDrift` (designed for new drifts) with a direct `driftStore.openDrift()` call when opening from tree card — bypasses the complex message-index-finding logic that was producing blank panels.
- Three-tier message fallback: `chatHistory` → `driftStore.getTempConversation` → `driftChat.messages` (the node itself always has messages since the tree renders the count).
- Context messages resolved from the parent chat's stored messages, not the stale closure — fixes the case where `switchChat` hasn't settled before context is read.

### 109. Drift Tree — mobile design compact pass (POLISH)
- Bottom sheet: `88dvh` (was 92), `16px` border radius (was 20px).
- Header: title `15px` clamped to 1 line (was 17px / 2 lines), tighter padding, close button `30×30` (was 36×36), drift badge text `10px`.
- Cards: padding `9/11px` (was `12/14px`), title `13px` (was `15px`), preview `11px` uniform on all sizes.
- Topics strip: label `9px`, chips `11px` / `3px 10px` padding / `26px` min-height.

### 108. Drift Tree — duplicate "Explored" chips disambiguated (FIX)
- Added `disambiguateTopics()`: two-pass over collected phrases — if "guitarist" appears twice, chips become "guitarist 1" / "guitarist 2". Single occurrences are unchanged.
- Applied in both mobile and desktop paths via `disambiguateTopics(collectTopics(tree))`.

### 107. Drift Tree — "Explored" chip bar horizontally scrollable (FIX)
- Added `flexWrap: 'nowrap'` to the chips scroll container — chips no longer wrap to a second line when there are many topics.
- Scrollbar hidden on all browsers (`scrollbarWidth: none` + `[&::-webkit-scrollbar]:hidden`) for a clean invisible-scroll feel.
- Applies to both desktop panel and mobile bottom sheet.

### 106. Drift Tree card → anchor scroll + open drift panel (NEW BEHAVIOUR)
- Tapping a drift card in the tree now: (1) switches to parent chat if needed, (2) smooth-scrolls the main chat to the exact source message anchor, (3) opens the DriftPanel with the existing drift conversation loaded. No more "just switch chat ID" — you land at the right place.
- Added `onOpenDrift` prop to `DriftKnowledgeGraph`. Mobile closes the bottom sheet on tap.

### 105. Drift Tree UX cleanup — redundant elements removed (POLISH)
- **Removed** per-message `↗ drift` badge below each message — the inline highlighted drift links already handle navigation, badge was redundant.
- **Removed** the old network-graph SVG icon from the top bar.
- **Removed** floating bottom-right `Drift Tree (N)` pill.
- **Added** Drift Tree button in header (right side, next to +New Chat): uses the app's own favicon icon (three-node graph with pink→violet gradient), shows a purple count badge, toggles active state when tree is open.

### 104. Drift Tree — desktop push layout (LAYOUT)
- When Drift Tree opens on desktop, main chat area slides left (shrinks `480px` from right) — like resizing a window. Full chat remains visible beside the tree panel.
- Desktop backdrop overlay removed (no dimming needed when content is pushed aside).
- Input bar and scroll-to-bottom button also reposition correctly.
- Mobile: unchanged — full-screen bottom sheet with backdrop.

### 103. Drift tree — two `↗ drifts` tags disambiguated (POLISH)
- Floating pill relabelled `GitBranch icon + "Drift Tree" + (N)` — clearly an overview action, not a per-message count.
- Inline badge simplified: `↗ drift` (singular, no count) vs `↗ N drifts` (multi).

### 102. Drift Tree — mobile-first redesign (MAJOR POLISH)
- **Mobile:** full-screen bottom sheet (`92dvh`), slides up from bottom, rounded top corners, drag handle, swipe-down-to-dismiss (80px threshold), blurred backdrop.
- **Cards:** 15px title, 12px preview, 10–11px labels — readable on mobile. Min touch target 44px. `active:scale-[0.98]` haptic feel.
- **Phrase pills:** larger (10px, rounded-full, border), max 28 chars.
- **Connector lines:** 1.5px wide for Retina visibility.
- **Topics strip:** horizontal scroll, 30px-tall chips.
- **Card top row fixed:** label left, msg-count pill + chevron right — no more text overlap.
- **Timestamp** moved to card bottom-right, its own line.
- **Collapse chevron** now `ChevronDown`/`ChevronRight` (semantically correct).

### 101. Drift Tree — topics strip, timestamps, collapsible branches (POLISH)
- **Topics strip:** Row of coloured chips below header — one per phrase drifted on, cycling violet→indigo→blue. Click any chip to jump directly to that drift.
- **Timestamps:** Relative time ("just now", "5m ago", "2h ago") per card.
- **Collapsible branches:** Chevron toggle on any card with children. Shows "N hidden branches" summary.

### 100. Drift Tree — complete visual overhaul, Apple-grade polish (REDESIGN)
- Width: `min(560px, 44vw)`. Titles wrap to 2 lines. Preview 120 chars / 11px / 2 lines.
- Depth palette: depth 1 = violet, depth 2 = indigo, depth 3+ = blue.
- Thick 3px coloured left accent border on drift cards. Hover shadow; active glow ring.

### 99. Drift Tree — complete rebuild, dropped ReactFlow (MAJOR REFACTOR)
- Replaced `@xyflow/react` with pure HTML/CSS/SVG indented tree list.
- Fixed duplicate node bug and stale message count.

### 94. "↗ 1 drift" button — correctly reopens existing drift conversation (BUG FIX)
### 93. Knowledge graph — edge labels show selected phrase (POLISH)
### 92. Knowledge graph — depth hierarchy visible via node styling (NEW)
### 91. Knowledge graph — direction-aware edge handles (BUG FIX)
### 90. Knowledge graph — live updates + node click keeps panel open (BUG FIX)
### 89. Unified radial mind map — replaced DriftMapPanel + DriftKnowledgeGraph (MAJOR REDESIGN)
### 88. Nested drift map reliability — critical bug fix (BUG FIX)
### 87. Phrase truncation removed / 86. ↗ drift tag on all pushed messages / 85. AddModelSheet in Settings (FIX/POLISH)

### 81. Subtle ↗ drift tag on pushed messages (FIX/POLISH)
### 80. Key-term highlights inside drift panel messages (NEW FEATURE)
### 79. Knowledge Graph — light mode support (FIX)
### 78–68: [see archived sessions below]

---

## Sessions 1–67 (archived)

| # | What |
|---|---|
| 67 | Previous session marker |
| 64 | Drift exploration bar — compact single-row redesign |
| 63 | Dead code removed (AddModelSheet JSX stub, addModelSheetOpen state) |
| 62 | Input buttons vertically centered (absolute top-0 bottom-0) |
| 61 | Drift breadcrumb navigation in DriftPanel header |
| 60 | Send arrow — no grey idle background |
| 59 | Sidebar dividers — bumped opacity (was invisible in dark mode) |
| 58 | Settings toggles — Apple UISwitch proportions |
| 57 | Drift reopens blank fix + nested Drift Map branches fix |
| 55 | Welcome screen cut off by keyboard — pt-[22vh] fix |
| 54 | "AI Settings" → "Settings" rename |
| 53 | Sidebar chat list — flat divider layout |
| 52 | App logo + favicon + iOS app icon — network icon brand |
| 51 | Drift map — nested temp drifts visible |
| 50 | Drift badge / inline link — opens existing drift correctly |
| 49 | Drift badge — moved to action row |
| 48 | Drift Map panel — light mode color fix |
| 47 | DriftMapPanel — bird's eye view (now superseded by radial graph) |
| 46 | Per-message drift count badge |
| 45 | Drift inline link restyle (underline only) |
| 44 | First-message coach mark (one-time floating pill) |
| 43 | New chat on every app open; input bar safe-area gap fix |
| 42 | Retroactive multi-model — stale activeBroadcastGroupId fix |
| 41 | Retroactive multi-model — user message in carousel fix |
| 40 | Input field gap when keyboard open fix |
| 39 | [object Object] in main chat on drift open — walkNode fix |
| 38 | [object Object] in Gemini grounding responses — multi-part SSE fix |
| 37 | Model tag badge overlapping drift message text fix |
| 36 | "Ask Drift" iOS text selection explored + reverted |
| 35 | Model tag label — increased opacity |
| 34 | Pushed drift messages — redesigned as regular AI messages |
| 33 | Drift context — parent conversation included in system prompt |
| 32 | Scroll reliability — touch-action pan-y |
| 31 | Swipe left/right to open/close sidebar |
| 30 | Multi-model continue — stale closure fix |
| 29 | Drift bottom bar — reliability overhaul (6 root causes) |
| 28 | Single-model → retroactive multi-model carousel |
| 27 | Model picker light mode fix |
| 26 | Scroll overlap in multi-model mode |
| 25 | User message not appearing after Continue on mobile |
| 24 | Drift bottom bar — full redesign (glassmorphic) |
| 23 | Continue button moved below content |
| 22 | Multi-model carousel swipe enabled |
| 21 | Single-model mode — remove purple dot |
| 20 | Drift bottom bar restored (.ai-message class) |
| 19 | Multi-model carousel text overflow fix |
| 18 | Input field polish (inactive send button) |
| 17 | DriftPanel input — match main chat layout |
| 16 | Retroactive model add to broadcast group |
| 15 | Multi-model carousel — frameless card design |
| 14 | Continue → button Gemini cases |
| 13 | Model selection toggle revert bug |
| 12 | Model picker light mode visibility |
| 11 | Voice input restart fix (fresh instance on onend) |
| 10 | Voice input toggle fix |
| 9 | ChatGPT-style input field (mic + send inside textarea) |
| 8 | iOS drift text selection — persistent bottom bar |
| 7 | Mobile multi-model chat (pills row + carousel + ModelPickerSheet) |
| 1–6 | AI reply design, DriftPanel keyboard fix, sidebar width, input placement, design polish, voice input initial |



## Current Architecture

```
src/
  App.tsx                    ~3000 lines
  hooks/
    useVoiceInput.ts         tap-to-speak, fresh-instance restart, 3-tier fallback
    useAutoScroll.ts
    useToast.ts
  store/
    chatStore.ts             chat sessions + IndexedDB persistence
    driftStore.ts            drift panel open/closed + temp conversations
    modelStore.ts            selected targets + per-chat model prefs (+ dummy provider)
    uiStore.ts               panels + theme (dark/light) state
  services/
    gemini.ts                PRIMARY — Gemini REST + SSE + grounding
    openrouter.ts            secondary
    ollama.ts                local models
    dummyAI.ts               streaming demo model (Demo AI)
    db.ts                    IndexedDB (idb)
    settingsStorage.ts       localStorage settings
  components/
    DriftPanel.tsx           ~1000 lines — side panel (keyboard-aware input)
    DriftKnowledgeGraph.tsx  mobile bottom sheet + desktop push panel — pure HTML/CSS tree, topics strip, anchor navigation
    SelectionTooltip.tsx     iOS: persistent bottom bar; desktop: floating tooltip
    MultiModelCarousel.tsx   mobile swipeable card carousel for broadcast
    ModelPillRow.tsx         model selection chips above input (mobile, light+dark)
    ModelPickerSheet.tsx     bottom sheet model picker (up to 3 models)
    Settings.tsx             settings panel
    Login.tsx                mobile + desktop layouts
    HeaderControls.tsx       model picker chip (desktop)
ios/
  App/                       Capacitor Xcode project
```

---

## Running Locally

```bash
cd /Users/morhogeg/Drift
npm run dev                            # web dev server
npm run build && npx cap sync ios      # build + sync to Xcode
```

**API key**: create `.env` in project root:
```
VITE_GEMINI_API_KEY=your_key_here
```

---

## What's Pending / Next Ideas

- [ ] **TestFlight submission** — archive build 50 in Xcode → upload to App Store Connect.
- [ ] **On-device pass — this session (Jun 4)** — verify the three bug fixes: (1) tap map node → "Open this drift" shows the full conversation (question + answer), not just the question; (2) tap synthesis "Next:" chip and it sends a real LLM question; (3) Hebrew chat shows lens labels like "הסבר בפשטות" not "Simplify this", and pushed drifts don't have duplicate English openers.
- [ ] **On-device pass — last session (Jun 3 PM)** — verify: sidebar row types (Chat/Drift/Synthesis) + drift nesting; Drift Map opens on a single tap (no flicker-close); map node `↳ parent` labels + breadcrumb; clickable AI terms appear on the map; Connect shows the *selected* term's cards (no cross-term bleed); per-term/lens conversation persists when switching terms; "Pick up where you left off" resume cards in the empty state; the two coachmarks (drift gesture + lens bar) appear once; "Related by meaning" in search + "you explored before" recall.
- [ ] **TODO(semantic) follow-ups** — seed the Connect lens from semantic neighbors (`DriftPanel.tsx`); draw semantic edges on the Drift Map (`DriftKnowledgeGraph.tsx`). Persist composite `{id}__connect` lens-thread connect-state to `driftInfos` (currently in-memory only).
- [ ] **On-device pass — providers/settings wave** — verify: (1) Add a model → OpenAI/Anthropic/Grok with an OpenRouter `sk-or-…` key actually streams; (2) Settings redesign reads well (branded glyphs, cards); (3) Ollama/Qwen3 gone from the Models list; (4) selecting text in chat no longer opens the sidebar.
- [ ] **On-device pass — content wave (Hebrew)** — Connect concepts in Hebrew script (no Latin); meaningful map labels (no "Barcelona 1/2/3"); bridge "Open this drift" opens the conversation; filter field; overall Connect/Simplify/Deep-dive quality.
- [ ] **(Optional) Native Anthropic + Gemini** — if a native Anthropic key is wanted, wire `api.anthropic.com` directly (CORS ok with `anthropic-dangerous-direct-browser-access` header); would make OpenAI/Grok-via-OpenRouter a hybrid. Left as-is for now by request.
- [ ] **Message editing + regeneration** — click to edit a sent message, regenerate the AI response. `updateMessage` already exists in chatStore.
- [ ] **Custom system prompts per chat** — per-chat persona/instruction. Services already accept system messages.
- [ ] **Export & Share** — export chat + its drift tree as Markdown/PDF. (Deferred by request.)
- [ ] **Security: Gemini key client-side** — key is bundled in the web build; move behind a proxy before any public release. (Deferred by request.)
- [ ] **Real auth** — Supabase Auth or Firebase Auth (Login screen is currently a placeholder)
- [ ] **Light theme color polish** — some hardcoded dark hex colors remain
- [ ] **App.tsx refactor** — ~3.9k lines, could extract more hooks
- [ ] **Voice output** — TTS read-back of AI responses
- [ ] **Cleanup** — `DriftMapPanel.tsx` is dead code (graph replaced it); `onOpenRelatedDrift` prop now unused in DriftPanel. Map scope toggle removed (#132) → `buildForest`/forest "All explorations" path is now dormant (scope fixed to `'chat'`); remove if the global map isn't coming back.

## Completed this session (was pending)
- ✅ AddModelSheet OpenRouter & Ollama · ✅ Conversation forking · ✅ Full-text search · ✅ Drift synthesis
