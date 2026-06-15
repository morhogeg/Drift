/**
 * uiStore — pure UI state (panels open/closed, hover/copy transients, etc.)
 *
 * Nothing here is persisted because it represents ephemeral viewport state.
 * Exception: `theme` is persisted to localStorage.
 */

import { create } from 'zustand'

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('drift-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

interface UIStore {
  // ── Theme ──────────────────────────────────────────────────────────────────
  theme: Theme

  // ── Panel visibility ───────────────────────────────────────────────────────
  sidebarOpen: boolean
  settingsOpen: boolean
  galleryOpen: boolean
  driftMapOpen: boolean
  knowledgeGraphOpen: boolean

  // ── Custom lens editor (inline "New lens" sheet) ────────────────────────────
  /** When non-null, the inline lens editor is open. A string = editing that lens
   *  id; '' = creating a new one. Null = closed. */
  customLensEditorId: string | null
  /** Bumped whenever custom lenses change — surfaces (tooltip, View-as bar) read
   *  it so a newly-created/edited/deleted lens appears without a manual refresh. */
  customLensesVersion: number

  // ── User account UI ────────────────────────────────────────────────────────
  userMenuOpen: boolean
  profileOpen: boolean

  // ── Message interaction states ─────────────────────────────────────────────
  hoveredMessageId: string | null
  copiedMessageId: string | null
  savedMessageIds: Set<string>

  // ── Chat editing ───────────────────────────────────────────────────────────
  editingChatId: string | null
  editingTitle: string

  // ── Sidebar pinned / starred chats (UI sets) ───────────────────────────────
  pinnedChats: Set<string>
  starredChats: Set<string>

  // ── Context menu ──────────────────────────────────────────────────────────
  contextMenu: { x: number; y: number; chatId: string } | null

  // ── Scroll ─────────────────────────────────────────────────────────────────
  showScrollButton: boolean

  // ── Snippet counter (derived from storage) ─────────────────────────────────
  snippetCount: number

  // ── Actions ────────────────────────────────────────────────────────────────
  setTheme: (theme: Theme) => void
  setSidebarOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setGalleryOpen: (open: boolean) => void
  setDriftMapOpen: (open: boolean) => void
  setKnowledgeGraphOpen: (open: boolean) => void
  setUserMenuOpen: (open: boolean) => void
  setProfileOpen: (open: boolean) => void

  /** Open the inline lens editor — pass a lens id to edit, or omit to create new. */
  openCustomLensEditor: (id?: string) => void
  closeCustomLensEditor: () => void
  /** Signal that the custom-lens set changed (save/delete) so readers re-render. */
  bumpCustomLensesVersion: () => void

  setHoveredMessageId: (id: string | null) => void
  /**
   * Mark a message as copied. Automatically clears itself after 2 seconds.
   * Pass null to clear immediately.
   */
  setCopiedMessageId: (id: string | null) => void

  setSavedMessageIds: (ids: Set<string>) => void
  addSavedMessageId: (id: string) => void
  removeSavedMessageId: (id: string) => void

  setEditingChatId: (id: string | null) => void
  setEditingTitle: (title: string) => void

  setPinnedChats: (chats: Set<string>) => void
  togglePinnedChat: (chatId: string) => void

  setStarredChats: (chats: Set<string>) => void
  toggleStarredChat: (chatId: string) => void

  setContextMenu: (menu: { x: number; y: number; chatId: string } | null) => void

  setShowScrollButton: (show: boolean) => void
  setSnippetCount: (count: number) => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  theme: (() => { const t = getInitialTheme(); applyTheme(t); return t })(),
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : false,
  settingsOpen: false,
  galleryOpen: false,
  driftMapOpen: false,
  knowledgeGraphOpen: false,
  customLensEditorId: null,
  customLensesVersion: 0,
  userMenuOpen: false,
  profileOpen: false,
  hoveredMessageId: null,
  copiedMessageId: null,
  savedMessageIds: new Set(),
  editingChatId: null,
  editingTitle: '',
  pinnedChats: new Set(),
  starredChats: new Set(),
  contextMenu: null,
  showScrollButton: false,
  snippetCount: 0,

  // ── Theme ──────────────────────────────────────────────────────────────────
  setTheme: (theme) => {
    localStorage.setItem('drift-theme', theme)
    applyTheme(theme)
    set({ theme })
  },

  // ── Panel setters ──────────────────────────────────────────────────────────
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setGalleryOpen: (open) => set({ galleryOpen: open }),
  setDriftMapOpen: (open) => set({ driftMapOpen: open }),
  setKnowledgeGraphOpen: (open) => set({ knowledgeGraphOpen: open }),
  setUserMenuOpen: (open) => set({ userMenuOpen: open }),
  setProfileOpen: (open) => set({ profileOpen: open }),

  openCustomLensEditor: (id) => set({ customLensEditorId: id ?? '' }),
  closeCustomLensEditor: () => set({ customLensEditorId: null }),
  bumpCustomLensesVersion: () => set((state) => ({ customLensesVersion: state.customLensesVersion + 1 })),

  // ── Interaction states ─────────────────────────────────────────────────────
  setHoveredMessageId: (id) => set({ hoveredMessageId: id }),

  setCopiedMessageId(id: string | null) {
    set({ copiedMessageId: id })
    if (id !== null) {
      setTimeout(() => {
        // Only clear if still the same id (avoid clearing a later copy)
        if (get().copiedMessageId === id) {
          set({ copiedMessageId: null })
        }
      }, 2000)
    }
  },

  setSavedMessageIds: (ids) => set({ savedMessageIds: ids }),

  addSavedMessageId(id: string) {
    set((state) => ({ savedMessageIds: new Set(state.savedMessageIds).add(id) }))
  },

  removeSavedMessageId(id: string) {
    set((state) => {
      const next = new Set(state.savedMessageIds)
      next.delete(id)
      return { savedMessageIds: next }
    })
  },

  // ── Chat editing ───────────────────────────────────────────────────────────
  setEditingChatId: (id) => set({ editingChatId: id }),
  setEditingTitle: (title) => set({ editingTitle: title }),

  // ── Pinned / starred ───────────────────────────────────────────────────────
  setPinnedChats: (chats) => set({ pinnedChats: chats }),

  togglePinnedChat(chatId: string) {
    set((state) => {
      const next = new Set(state.pinnedChats)
      if (next.has(chatId)) next.delete(chatId)
      else next.add(chatId)
      return { pinnedChats: next }
    })
  },

  setStarredChats: (chats) => set({ starredChats: chats }),

  toggleStarredChat(chatId: string) {
    set((state) => {
      const next = new Set(state.starredChats)
      if (next.has(chatId)) next.delete(chatId)
      else next.add(chatId)
      return { starredChats: next }
    })
  },

  // ── Context menu ───────────────────────────────────────────────────────────
  setContextMenu: (menu) => set({ contextMenu: menu }),

  // ── Scroll ─────────────────────────────────────────────────────────────────
  setShowScrollButton: (show) => set({ showScrollButton: show }),
  setSnippetCount: (count) => set({ snippetCount: count }),
}))
