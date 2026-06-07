import { useChatStore } from '@/store/chatStore'
import { useUIStore } from '@/store/uiStore'
import type { ChatSession } from '@/types/chat'

/**
 * Sidebar chat CRUD + context-menu actions: rename (inline edit + save),
 * duplicate, delete, pin/unpin, star/unstar, and opening the right-click menu.
 *
 * These are thin delegators over chatStore/uiStore — the editing state
 * (`editingChatId` / `editingTitle`) lives in uiStore, so the hook subscribes
 * to both stores directly rather than taking props.
 */
export function useChatActions() {
  const chatStore = useChatStore()
  const uiStore = useUIStore()
  const chatHistory = chatStore.chatHistory
  const editingChatId = uiStore.editingChatId
  const editingTitle = uiStore.editingTitle

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    uiStore.setContextMenu({ x: e.clientX, y: e.clientY, chatId })
  }

  const handleRenameChat = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId)
    if (chat) {
      uiStore.setEditingChatId(chatId)
      uiStore.setEditingTitle(chat.title)
    }
  }

  const handleSaveRename = () => {
    if (editingChatId && editingTitle.trim()) {
      chatStore.updateChat(editingChatId, { title: editingTitle.trim() })
    }
    uiStore.setEditingChatId(null)
    uiStore.setEditingTitle('')
  }

  const handleDuplicateChat = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId)
    if (chat) {
      const newChat: ChatSession = {
        ...chat,
        id: Date.now().toString(),
        title: `${chat.title} (Copy)`,
        createdAt: new Date()
      }
      useChatStore.setState(state => ({
        chatHistory: [newChat, ...state.chatHistory]
      }))
    }
  }

  const handleDeleteChat = (chatId: string) => {
    if (confirm('Are you sure you want to delete this chat?')) {
      chatStore.deleteChat(chatId)
    }
  }

  const handleTogglePin = (chatId: string) => uiStore.togglePinnedChat(chatId)
  const handleToggleStar = (chatId: string) => uiStore.toggleStarredChat(chatId)

  return {
    handleContextMenu,
    handleRenameChat,
    handleSaveRename,
    handleDuplicateChat,
    handleDeleteChat,
    handleTogglePin,
    handleToggleStar
  }
}
