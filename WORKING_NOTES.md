# Drift — Working Notes

Developer context for ongoing work across sessions.

---

## Current State (Mar 2026)

### What works
- Core **Drift** feature — text selection → side chat → push to main / save as chat
- **Multi-model broadcast** — parallel responses from OpenRouter (Qwen3, OSS-20B) + Ollama
- Snippet gallery — full CRUD, search, export
- Settings — API key, Ollama config, connection test
- Chat management — rename, duplicate, pin, delete, search
- Per-chat model preferences (LocalStorage persisted)
- RTL (Hebrew) text support
- Streaming with cancellation (AbortController)

### What doesn't work / is incomplete
- **Chat history is NOT persisted** — reload loses everything (top priority)
- **Auth is a dummy stub** — Login UI does nothing real
- No automated tests
- Mobile layout untested
- Calendar/heatmap snippet view (type defined, no UI)

---

## Architecture

```
App.tsx (3280 lines, 30+ useState hooks) ← main concern, needs splitting
  ├── services/openrouter.ts     ← OpenRouter API + SSE streaming
  ├── services/ollama.ts         ← Ollama NDJSON streaming
  ├── services/dummyAI.ts        ← Mock AI for dev/testing
  ├── services/snippetStorage.ts ← LocalStorage
  ├── services/settingsStorage.ts
  ├── components/DriftPanel.tsx  ← 976 lines, drift side chat
  ├── components/SelectionTooltip.tsx  ← text selection handler
  ├── components/SnippetGallery.tsx
  ├── components/HeaderControls.tsx    ← model selector
  └── components/Settings.tsx
```

### State that needs to leave App.tsx
- Chat state: `activeChatId`, `messages`, `chatHistory`, `isTyping`, `streamingResponse`
- Drift state: `driftOpen`, `driftContext`, `tempDriftConversations`, `driftExpanded`
- Model state: `selectedTargets`, `chatModelPrefs`, `useOpenRouter`
- UI state: `sidebarOpen`, `settingsOpen`, `galleryOpen`, `hoveredMessageId`

---

## Planned Improvements (Prioritized)

### Phase 1 — Foundation (do first)
1. **Persist chat history** — IndexedDB via `idb` or `localforage`. Key: avoid localStorage's ~5MB limit with long conversations.
2. **Split App.tsx** — Extract into custom hooks: `useChatState`, `useDriftState`, `useModels`, `useUI`
3. **More models** — Add Claude 3.5 Haiku, Gemini Flash, GPT-4o mini to OpenRouter options

### Phase 2 — Core UX
4. Real auth (Supabase Auth or Firebase Auth)
5. Message editing + regeneration
6. Toast notifications for errors/success
7. Keyboard shortcuts expansion

### Phase 3 — Drift enhancements
8. Visual indicator on source message text when a drift exists (underline / highlight)
9. Multi-level drift (drift from inside a drift panel)
10. Drift timeline / history per message

### Phase 4 — Power features
11. Full chat export (JSON + Markdown)
12. Folder/workspace organization
13. Mobile (Capacitor)

---

## LLM Providers

| Provider | Models | Notes |
|---|---|---|
| OpenRouter | `qwen/qwen3-235b-a22b:free`, `openai/gpt-oss-20b:free` | Bearer token auth, SSE streaming |
| Ollama | configurable model | Local, NDJSON streaming, URL configurable |
| Dummy AI | built-in | Always works, no API key needed, great for dev |

All use `{ role: 'user' | 'assistant' | 'system', content: string }[]` format.

---

## Key Code Patterns

### Streaming response
```typescript
await sendMessageToOpenRouter(
  apiMessages,
  (chunk) => setStreamingResponse(prev => prev + chunk), // onStream callback
  abortControllerRef.current.signal
)
```

### Broadcast mode (multi-model)
```typescript
// selectedTargets: Target[] (>1 means broadcast)
// Each target sends independently, tagged with broadcastGroupId
const broadcastGroupId = `broadcast-${Date.now()}`
for (const target of selectedTargets) {
  // send to target.provider using target.key
  // tag response message with { modelTag: target.label, broadcastGroupId }
}
```

### Drift data flow
```
User selects text
  → SelectionTooltip shows
  → onStartDrift(selectedText, messageId) fires
  → App.tsx creates driftContext { selectedText, sourceMessageId, contextMessages }
  → DriftPanel opens with isolated conversation
  → On "Push to main": messages inserted with isDriftPush: true
  → On "Save as chat": new chat session created in chatHistory
  → Source message updated: hasDrift: true, driftInfos: [{selectedText, driftChatId}]
```

---

## Dev Setup

```bash
cd /Users/morhogeg/Drift
npm install
npm run dev        # start dev server

# .env (optional — can also set in Settings UI)
VITE_OPENROUTER_API_KEY=your_key
```

Dummy AI works without any API key — good for testing Drift and UI features.
