# Drift - Intelligent Conversation Explorer

A sophisticated AI chat application featuring a unique "drift" capability that allows users to branch conversations and explore concepts in isolated, focused discussions.

## Overview

Drift transforms the traditional AI chat experience by introducing contextual branching. Select any text from an AI response to "drift" into a focused exploration of that specific concept, maintaining complete separation from the main conversation thread.

Built with React, TypeScript, and Tailwind CSS, Drift features a refined dark glassmorphic aesthetic with purple/pink gradient accents for an elegant, modern interface.

## Current Features

### 🌀 Drift Mode - Signature Feature
- **Text Selection Branching**: Select any text from AI responses to open a drift conversation
- **Isolated Context**: Each drift maintains its own conversation context separate from the main chat
- **Push to Main**: Merge drift discoveries back into the main conversation with undo capability
- **Visual Indicators**: Purple gradient selection tooltip with drift emoji (🌀)
- **Seamless Navigation**: "Go to Source" feature to return to the original conversation
- **Persistent Drift Chats**: Drift conversations are saved and accessible from the sidebar

### 💬 Chat System
- **Dual AI Support**: Toggle between OpenRouter (cloud) and Ollama (local) models
- **Auto-Titling**: Conversations automatically generate titles from the first user message
- **Markdown Rendering**: Full markdown support with syntax highlighting for code blocks
- **Streaming Responses**: Real-time streaming of AI responses
- **Chat History**: Sidebar with all conversations, searchable and organized

### 📚 Snippet Gallery
- **Save Snippets**: Capture selected text, individual messages, or entire conversations
- **Organization**: Add tags, notes, and star important snippets
- **Dual Views**: Switch between grid and list layouts
- **Search & Filter**: Find snippets by content or tags
- **Export**: Download snippets as Markdown files

### 🎨 User Interface
- **Context Menus**: Right-click on chats for rename, duplicate, pin, star, and delete options
- **Inline Editing**: Rename chats directly without modal dialogs
- **Pinned Chats**: Pin important conversations to keep them at the top
- **Dark Theme**: Elegant dark glassmorphic design with subtle transparency effects
- **Smooth Animations**: Refined transitions and hover effects throughout

## Technical Implementation

### Tech Stack
- **React 18** - Modern UI framework with hooks
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling with custom design system
- **Vite** - Fast build tool and development server
- **LocalStorage** - Client-side persistence for chats and snippets

### Architecture Highlights
- Component-based architecture with reusable UI elements
- Service layer for API integrations (OpenRouter and Ollama)
- Custom hooks for state management
- TypeScript interfaces for type safety
- Error boundaries for graceful error handling

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- OpenRouter API key (for cloud AI) or Ollama installation (for local AI)

### Installation

```bash
# Clone the repository
git clone https://github.com/morhogeg/Drift.git
cd drift

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your OpenRouter API key to .env file

# Start development server
npm run dev
```

### Building for Production

```bash
# Create production build
npm run build

# Preview production build
npm run preview
```

## Configuration

### API Setup
- **OpenRouter**: Sign up at [openrouter.ai](https://openrouter.ai) and add your API key to `.env`
- **Ollama**: Install Ollama locally and ensure it's running on port 11434

## Project Structure

```
/src
  /components
    DriftPanel.tsx       # Drift mode UI and logic
    SelectionTooltip.tsx # Text selection handler
    SnippetGallery.tsx   # Snippet management interface
    ContextMenu.tsx      # Right-click context menu
    ErrorBoundary.tsx    # Error handling wrapper
  /services
    openrouter.ts        # OpenRouter API integration
    ollama.ts            # Ollama API integration
    snippetStorage.ts    # LocalStorage management
  /types
    snippet.ts           # TypeScript type definitions
  App.tsx               # Main application component
```

## Future Development

### Planned Features
- [ ] **Keyboard Shortcuts**: Power-user keyboard navigation
- [ ] **Mobile Responsive Design**: Optimized layouts for tablets and phones
- [ ] **Performance Optimizations**: Lazy loading and memoization for large chat histories
- [ ] **Advanced Search**: Full-text search across all conversations
- [ ] **Export/Import**: Backup and restore chat histories
- [ ] **Folder Organization**: Group related conversations
- [ ] **Collaborative Features**: Share conversations and collaborate in real-time
- [ ] **Additional AI Models**: Support for more AI providers and models
- [ ] **Calendar View**: Heatmap visualization of chat activity
- [ ] **Offline Support**: Work without internet connection using local models

### Under Consideration
- Theme customization options
- Voice input/output capabilities
- Plugin system for extensibility
- Multi-language support

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

### Development Guidelines
1. Follow existing TypeScript and React patterns
2. Maintain the established design system
3. Write clear commit messages
4. Test across different browsers
5. Ensure no console errors or warnings

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Drift is built with modern web technologies and designed to provide a premium chat experience that enhances how users explore and develop ideas through AI conversation.

---

**Drift** - Where conversations branch naturally.