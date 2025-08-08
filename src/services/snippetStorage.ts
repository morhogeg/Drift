import type { Snippet, SnippetFilter } from '../types/snippet'

const STORAGE_KEY = 'drift_snippets'

// Helper functions for localStorage operations
function loadSnippets(): Map<string, Snippet> {
  const snippets = new Map<string, Snippet>()
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        parsed.forEach(snippet => {
          if (snippet && snippet.id) {
            // Convert date strings back to Date objects
            snippet.createdAt = new Date(snippet.createdAt)
            snippet.updatedAt = new Date(snippet.updatedAt || snippet.createdAt)
            if (snippet.source && snippet.source.timestamp) {
              snippet.source.timestamp = new Date(snippet.source.timestamp)
            }
            snippets.set(snippet.id, snippet)
          }
        })
      }
    }
  } catch (error) {
    console.error('Failed to load snippets:', error)
  }
  
  return snippets
}

function saveSnippets(snippets: Map<string, Snippet>): void {
  try {
    const snippetsArray = Array.from(snippets.values())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippetsArray))
  } catch (error) {
    console.error('Failed to save snippets:', error)
  }
}

function generateTitle(content: string): string {
  // Remove markdown formatting
  const cleaned = content
    .replace(/[#*`\[\]()]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  
  // Take first 50 chars or up to first period/question mark
  const firstSentence = cleaned.match(/^[^.?!]{1,50}/)?.[0] || cleaned.substring(0, 50)
  
  return firstSentence + (firstSentence.length < cleaned.length ? '...' : '')
}

// Export object with all functions
export const snippetStorage = {
  createSnippet(
    content: string,
    source: Snippet['source'],
    options?: {
      title?: string
      tags?: string[]
      notes?: string
      starred?: boolean
    }
  ): Snippet {
    const snippets = loadSnippets()
    
    // Auto-generate title if not provided
    const title = options?.title || generateTitle(content)
    
    // Create preview (first 150 chars)
    const preview = content.length > 150 
      ? content.substring(0, 150) + '...'
      : content

    const snippet: Snippet = {
      id: 'snippet-' + Date.now(),
      title,
      content,
      preview,
      tags: options?.tags || [],
      notes: options?.notes || '',
      starred: options?.starred || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      source
    }

    snippets.set(snippet.id, snippet)
    saveSnippets(snippets)
    return snippet
  },

  updateSnippet(id: string, updates: Partial<Omit<Snippet, 'id' | 'createdAt' | 'source'>>): Snippet | null {
    const snippets = loadSnippets()
    const snippet = snippets.get(id)
    if (!snippet) return null

    const updated = {
      ...snippet,
      ...updates,
      updatedAt: new Date()
    }

    snippets.set(id, updated)
    saveSnippets(snippets)
    return updated
  },

  deleteSnippet(id: string): boolean {
    const snippets = loadSnippets()
    const deleted = snippets.delete(id)
    if (deleted) {
      saveSnippets(snippets)
    }
    return deleted
  },

  deleteMultiple(ids: string[]): number {
    const snippets = loadSnippets()
    let count = 0
    ids.forEach(id => {
      if (snippets.delete(id)) count++
    })
    if (count > 0) {
      saveSnippets(snippets)
    }
    return count
  },

  getSnippet(id: string): Snippet | undefined {
    const snippets = loadSnippets()
    return snippets.get(id)
  },

  getAllSnippets(): Snippet[] {
    const snippets = loadSnippets()
    return Array.from(snippets.values())
  },

  getFilteredSnippets(filter: SnippetFilter): Snippet[] {
    let snippets = this.getAllSnippets()

    // Search query
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase()
      snippets = snippets.filter(s => 
        s.title.toLowerCase().includes(query) ||
        s.content.toLowerCase().includes(query) ||
        s.tags.some(tag => tag.toLowerCase().includes(query)) ||
        s.notes.toLowerCase().includes(query)
      )
    }

    // Tags filter
    if (filter.tags && filter.tags.length > 0) {
      snippets = snippets.filter(s =>
        filter.tags!.some(tag => s.tags.includes(tag))
      )
    }

    // Starred filter
    if (filter.starred !== undefined) {
      snippets = snippets.filter(s => s.starred === filter.starred)
    }

    // Date range filter
    if (filter.dateRange) {
      snippets = snippets.filter(s =>
        s.createdAt >= filter.dateRange!.start &&
        s.createdAt <= filter.dateRange!.end
      )
    }

    // Chat ID filter
    if (filter.chatId) {
      snippets = snippets.filter(s => s.source.chatId === filter.chatId)
    }

    return snippets
  },

  getAllTags(): string[] {
    const snippets = loadSnippets()
    const tags = new Set<string>()
    snippets.forEach(snippet => {
      snippet.tags.forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  },

  getSnippetsByDate(): Map<string, Snippet[]> {
    const byDate = new Map<string, Snippet[]>()
    
    this.getAllSnippets().forEach(snippet => {
      const dateKey = snippet.createdAt.toISOString().split('T')[0]
      const existing = byDate.get(dateKey) || []
      existing.push(snippet)
      byDate.set(dateKey, existing)
    })

    return byDate
  },

  exportSnippets(ids?: string[]): string {
    const allSnippets = loadSnippets()
    const snippets = ids 
      ? ids.map(id => allSnippets.get(id)).filter(Boolean) as Snippet[]
      : Array.from(allSnippets.values())

    return JSON.stringify(snippets, null, 2)
  },

  exportAsMarkdown(ids?: string[]): string {
    const allSnippets = loadSnippets()
    const snippets = ids 
      ? ids.map(id => allSnippets.get(id)).filter(Boolean) as Snippet[]
      : Array.from(allSnippets.values())

    return snippets.map(s => `# ${s.title}\n\n${s.content}\n\n---\n\n`).join('')
  }
}