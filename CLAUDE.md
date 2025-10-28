# Drift AI Chat Application - Project Memory

## Product Vision & Purpose

Drift is a sophisticated AI chat application with a unique "drift" feature that allows users to explore specific concepts from conversations in focused, branching discussions. It's designed for deep, exploratory conversations with elegant UI/UX.

## Core Features

### 1. Main Chat System

- Dual AI support: OpenRouter (OpenAI OSS-20B) and Ollama (local)
- Auto-titling from first user message
- Full markdown support with syntax highlighting
- Smooth streaming responses
- Chat history in sidebar with search

### 2. Drift Mode (Signature Feature)

- Select any text from AI responses to "drift" into focused exploration
- Purple gradient selection tooltip for text selection
- Drift conversations start with simple system message: "What would you like to know about [term]?"
- Can be saved as new chats or pushed back to main conversation with undo capability
- Bidirectional navigation between main and drift chats
- Inline clickable drift links in main chat
- Pushed drift messages display with:
  - Single messages: Elegant "Drift" gradient tag in top-right corner, 95% width for more content
  - Multi-message threads: Connected purple-bordered background with "Drift conversation" header
  - Context info shows "From:" and "Q:" on separate lines with full content visible

### 3. Snippet Gallery

- Save selected text, full messages, or entire chats
- Grid/List views with search and filtering
- Tags, notes, and starred snippets
- Export to Markdown
- Cyan/teal color scheme (distinct from purple Drift branding)

### 4. Sidebar Context Menu

- Right-click for Rename, Duplicate, Pin, Star, Delete
- "Go to Source" for drift chats
- Inline editing for rename
- Pinned chats stay at top

## Design System & Style Guide

### Color Palette

```css
/* Dark theme foundation */
--dark-bg: #0a0a0a
--dark-surface: #111111
--dark-elevated: #1a1a1a
--dark-border: #333333

/* Brand colors */
--accent-pink: #ff006e (Drift primary)
--accent-violet: #a855f7 (Drift secondary)
--cyan: #06b6d4 (Snippets)
--teal: #14b8a6 (Snippets secondary)

/* Text hierarchy */
--text-primary: #ffffff
--text-secondary: #9ca3af
--text-muted: #6b7280
```

### UI Characteristics

- Dark glassmorphic aesthetic with subtle transparency
- Gradient accents for interactive elements
- Smooth animations (200-300ms transitions)
- Rounded corners (rounded-lg/xl)
- Subtle shadows with color tints
- Hover effects with scale transforms
- Minimal emoji usage - removed from drift panel header for cleaner look

### Typography & Spacing

- Font: Inter (300-700 weights)
- Compact but readable spacing
- Clear visual hierarchy
- Truncated text with ellipsis for long content

### Component Patterns

- Buttons: Gradient backgrounds with border, hover scale
- Cards: Dark elevated backgrounds with hover states
- Inputs: Dark backgrounds with violet focus rings
- Modals/Panels: Slide-in with backdrop blur
- Context Menus: Scale-in animation, glassmorphic style

## Technical Architecture

### File Structure

```
/src
  /components
    - DriftPanel.tsx (drift mode UI)
    - SelectionTooltip.tsx (text selection handler)
    - SnippetGallery.tsx (snippet management)
    - ContextMenu.tsx (right-click menu)
  /services
    - openrouter.ts (OpenRouter API)
    - ollama.ts (Ollama API)
    - snippetStorage.ts (localStorage snippets)
  /types
    - snippet.ts (TypeScript interfaces)
  - App.tsx (main application)
```

### Key Implementation Details

- React + TypeScript + Vite
- Tailwind CSS for styling
- LocalStorage for persistence
- Streaming API responses
- Type-only imports for interfaces
- Singleton pattern avoided (caused loading issues)

## Important UX Principles

1. Focused Exploration: Drift conversations are isolated from main context
2. Visual Distinction: Purple for Drift, Cyan for Snippets
3. Seamless Navigation: Bidirectional links and smooth scrolling
4. Clean Sidebar: No redundant indicators (icons OR text, not both)
5. Smart Defaults: Auto-titling, context-aware menus
6. Performance: Lazy loading, efficient re-renders

## Current State & Gotchas

- App uses OpenRouter API by default (toggle available)
- Snippet Gallery fully functional with cyan theme
- Context menu works with all features
- "Go to Source" navigation functional
- Push to Main feature fully working with undo capability
- Drift panel UI simplified - no emoji, cleaner system message
- Pushed drift messages have special styling (wider bubbles, gradient tags)
- No calendar/heatmap view yet (pending feature)
- TypeScript verbatimModuleSyntax requires type-only imports

## Future Considerations

- Calendar/heatmap view for snippets
- Folder organization for chats
- Export/import chat history
- Collaborative features
- More AI model options

## Brand Voice

- Sophisticated but approachable
- Minimal without being austere
- Focused on deep exploration
- Elegant interactions and transitions
- Purple/Pink gradient as signature brand element

**Remember**: This is a premium chat experience focused on thoughtful exploration of ideas, not just Q&A. Every interaction should feel smooth, intentional, and valuable.