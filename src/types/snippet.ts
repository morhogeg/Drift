export interface Snippet {
  id: string
  title: string
  content: string
  preview: string
  tags: string[]
  notes: string
  starred: boolean
  createdAt: Date
  updatedAt: Date
  source: {
    chatId: string
    chatTitle: string
    messageId: string
    isFullMessage: boolean
    timestamp: Date
  }
}

export interface SnippetFilter {
  searchQuery?: string
  tags?: string[]
  starred?: boolean
  dateRange?: {
    start: Date
    end: Date
  }
  chatId?: string
}

export type SnippetSortBy = 'createdAt' | 'updatedAt' | 'title'
export type SnippetView = 'grid' | 'list' | 'calendar'