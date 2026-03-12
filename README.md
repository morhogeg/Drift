# Drift

> An AI chat interface built around the idea that the most interesting part of a conversation is rarely the answer — it's the question the answer makes you want to ask.

Drift lets you branch any AI conversation mid-stream. Highlight a word or sentence, open a focused side conversation in one click, then merge your findings back into the main thread — or save them as a standalone chat. Beyond branching, Drift supports simultaneous multi-model broadcasting and a visual mind map of every conversation branch.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite)](https://vitejs.dev)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

### Drift — Branching Conversations

The core of the product. Select any text from an AI response and open it in a focused side panel. The drift conversation inherits full context from the parent chat, so the AI understands exactly what you're referring to. When you're done exploring, you can:

- **Push to main** — inject the drift exchange into the main conversation with a single click (fully undoable)
- **Save as chat** — promote the drift to a standalone conversation in your history (also undoable)
- **Close and discard** — no trace left; the inline link remains in the parent for re-opening later

Every word or phrase that has been drifted gets an inline underline link in the original message. Clicking it re-opens that specific drift panel, even after closing. A `↗ N drifts` badge on any message shows a count at a glance.

A one-time coach mark appears on first use ("Select any text to drift →") and is never shown again.

### Drift Map — Visual Branch Explorer

Open the Drift Map (`⌘⌥M`) to see the entire conversation tree at once. The active chat renders as a vertical spine of messages, with violet branches extending for each drift. Branches nest up to three levels deep for multi-hop explorations. Navigation is one click: select any node to jump directly to that drift or scroll to the source message in the main chat.

The map is derived entirely from existing message metadata — no separate data model, no schema migrations.

### Multi-Model Broadcast

Send the same message to multiple AI models simultaneously. Responses appear as a swipeable carousel (mobile) or side-by-side cards (desktop). From any card:

- **Continue** — lock in that model and carry the conversation forward
- **Retroactive broadcast** — after a single-model reply arrives, add more models; the existing exchange upgrades into a carousel automatically

Supported providers: **Google Gemini** (Flash Lite, Flash, Flash 2.5, Flash 2.0), **OpenRouter** (Qwen3, GPT-OSS-20B), **Ollama** (any local model), **Demo AI** (streaming demo, no API key required).

### Chat History & Organization

Full chat history persisted to IndexedDB — survives refreshes, closes, and app restarts. The sidebar supports:

- Right-click context menu: rename, duplicate, pin, star, delete, go to source (for drift chats)
- Inline rename (no modal)
- Pinned conversations stay at the top
- Per-chat model memory — each chat remembers the last model used

### Snippet Gallery

Save anything: a selected phrase, a full AI message, or an entire conversation. Snippets support tags, personal notes, and a starred flag. Toggle between grid and list views, search by content or tag, and export any snippet as a Markdown file.

### Voice Input

Tap the microphone button to speak your message. The app uses Web Speech API with a fresh-instance restart strategy to keep the mic live across silence gaps. Both microphone and speech recognition permissions are requested on first use (iOS prompt appears once).

### Theme Support

Dark (default) and light mode, toggled from the header. The choice persists in localStorage. All components — including DriftPanel, Drift Map, model picker sheet, and carousels — fully adapt to both themes.

### iOS Native App

Drift ships as a Capacitor iOS app. Keyboard detection, safe-area padding, scroll-snap carousels, and swipe gestures (swipe left to open the sidebar, right to close) are all handled at the native layer.

---

## Tech Stack

| Layer | Library / Tool | Version |
|---|---|---|
| UI framework | React | 19.1 |
| Language | TypeScript | 5.8 |
| Build | Vite | 7.0 |
| Styling | Tailwind CSS | 3.4 |
| Animation | Framer Motion | 11 |
| State | Zustand | 5.0 |
| Persistence | idb (IndexedDB) | 8.0 |
| Markdown | react-markdown + remark-gfm | 9.1 |
| Syntax highlight | react-syntax-highlighter | 15.6 |
| Icons | Lucide React | 0.400 |
| Mobile | Capacitor | 8.2 |
| Local AI | Ollama SDK | 0.5 |

**AI Providers (raw Fetch — no SDK)**

| Provider | Models |
|---|---|
| Google Gemini | gemini-3.1-flash-lite-preview · gemini-3-flash-preview · gemini-2.5-flash · gemini-2.0-flash |
| OpenRouter | qwen/qwen3-235b-a22b · openai/gpt-oss-20b |
| Ollama | any locally installed model |
| Demo AI | built-in streaming mock (no API key) |

Raw Fetch is intentional — the Gemini SDK uses Node.js APIs incompatible with Capacitor's WKWebView environment. All providers use SSE streaming with chunked decoding.

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- *(Optional)* A Google Gemini API key — [get one free](https://aistudio.google.com/app/apikey)
- *(Optional)* Ollama installed locally for offline/local models

### Installation

```bash
git clone https://github.com/morhogeg/Drift.git
cd Drift

npm install

cp .env.example .env
# Add your API key(s) to .env — see Configuration below

npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The app works immediately with the built-in Demo AI model — no API key required to explore the interface.

### iOS Development

```bash
npm run build
npx cap sync ios
npx cap open ios   # Opens the project in Xcode
```

Build and run the Xcode target on a simulator or device. On first launch iOS will prompt for microphone and speech recognition permissions — both are required for voice input.

---

## Configuration

Environment variables are read at build time by Vite. Keys entered via the in-app Settings panel take precedence and are stored in localStorage.

**.env**

```bash
# Google Gemini (recommended — free tier available)
VITE_GEMINI_API_KEY=your_key_here

# OpenRouter (optional — for Qwen3, GPT-OSS, etc.)
VITE_OPENROUTER_API_KEY=your_key_here
```

The app is fully functional without any env vars using Demo AI. Ollama requires no API key — just a running Ollama server on `http://localhost:11434`.

### In-App Settings

Open Settings from the header to:

- Enter or rotate API keys
- Enable / disable individual model presets
- Set the Ollama server URL and model name
- Switch the active theme

Settings are stored under the `drift_ai_settings` key in localStorage.

---

## Architecture

```
src/
├── App.tsx                     # Root — routing, layout, keyboard shortcuts, gesture wiring
│
├── components/
│   ├── DriftPanel.tsx          # Side panel — isolated drift conversation
│   ├── DriftMapPanel.tsx       # Drift Map — recursive tree view (⌘⌥M)
│   ├── SelectionTooltip.tsx    # Text selection — desktop tooltip + iOS bottom bar
│   ├── MultiModelCarousel.tsx  # Swipeable broadcast response cards
│   ├── ModelPillRow.tsx        # Active model chips above input (mobile)
│   ├── ModelPickerSheet.tsx    # Bottom sheet model selector
│   ├── SnippetGallery.tsx      # Snippet save / search / export
│   ├── ContextMenu.tsx         # Right-click menu for sidebar items
│   ├── HeaderControls.tsx      # Desktop header — model picker, map button
│   ├── Settings.tsx            # API keys + model configuration panel
│   └── Login.tsx               # Auth entry screen (placeholder)
│
├── store/                      # Zustand state — one store per domain
│   ├── chatStore.ts            # Messages, active chat, IndexedDB persistence
│   ├── driftStore.ts           # Drift panel open state + in-memory temp conversations
│   ├── modelStore.ts           # Selected targets, per-chat model prefs (localStorage)
│   └── uiStore.ts              # Theme, panel visibility, hover state
│
├── services/
│   ├── gemini.ts               # Gemini REST + SSE streaming + Search grounding
│   ├── openrouter.ts           # OpenRouter SSE streaming
│   ├── ollama.ts               # Ollama SDK streaming
│   ├── dummyAI.ts              # Word-by-word demo streamer
│   ├── db.ts                   # IndexedDB schema + helpers (idb)
│   ├── settingsStorage.ts      # localStorage settings with migration logic
│   └── snippetStorage.ts       # Snippet CRUD in localStorage
│
├── hooks/
│   ├── useVoiceInput.ts        # Web Speech API — tap-to-speak, fresh-instance restart
│   ├── useAutoScroll.ts        # Scroll-to-bottom on new messages
│   └── useToast.ts             # Toast notification queue
│
├── types/
│   └── chat.ts                 # All shared TypeScript interfaces
│
└── utils/
    └── rtl.ts                  # RTL text direction detection
```

### State Model

| Store | Persistence | Responsibility |
|---|---|---|
| `chatStore` | IndexedDB | All chats and messages. Mutations fire async persist (fire-and-forget). |
| `driftStore` | Memory only | Drift panel open/closed state; unsaved (temp) drift conversations. |
| `modelStore` | localStorage | Selected model targets per chat; normalises and de-dupes across migrations. |
| `uiStore` | localStorage (theme only) | Panels, hover transients, theme. Nothing else survives reload. |

### Drift Data Model

Drift metadata lives directly on messages — no separate collection. Each AI message carries a `driftInfos` array:

```typescript
type DriftInfo = {
  selectedText: string;   // The text that was highlighted
  driftChatId: string;    // The ID of the drift conversation
};
```

The Drift Map, inline links, and badges all derive from this array at render time. Temp (unsaved) drifts live in `driftStore` memory and are merged into the map view via a `getTempMessages` callback prop.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘⌥N` / `Ctrl+Alt+N` | New chat |
| `⌘⌥M` / `Ctrl+Alt+M` | Toggle Drift Map |
| `Enter` | Send message |
| `Shift+Enter` | Insert line break |
| `Escape` | Cancel inline rename |
| `Enter` | Confirm inline rename |

---

## Roadmap

- [ ] **Message editing** — click to edit a sent message, auto-regenerate the AI reply
- [ ] **Message regeneration** — re-run the last AI response without editing
- [ ] **Multi-level drift** — open a drift from inside an existing drift conversation (tree rendering already supports this)
- [ ] **Code block copy button** — one-click copy on syntax-highlighted blocks
- [ ] **Real authentication** — Supabase or Firebase Auth (the Login screen is currently a placeholder)
- [ ] **More models** — Gemini 2.5 Pro, Claude, GPT-4o in the model picker
- [ ] **Voice output** — TTS read-back of AI responses
- [ ] **Drift Map navigation** — wire spine nodes to scroll-to-source in the main chat
- [ ] **TestFlight / App Store** — public iOS release

---

## License

Licensed under the [Apache License 2.0](LICENSE).

---

*Drift — where every answer opens a new question.*
