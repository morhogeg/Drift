import { useState, useEffect } from 'react'
import { 
  Search, Grid, List, Calendar, Star, Tag, 
  Download, Trash2, Edit2, Copy, ExternalLink,
  X, ChevronLeft, Filter, Check
} from 'lucide-react'
import { snippetStorage } from '../services/snippetStorage'
import type { Snippet, SnippetView, SnippetFilter } from '../types/snippet'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SnippetGalleryProps {
  isOpen: boolean
  onClose: () => void
  onNavigateToSource?: (chatId: string, messageId: string) => void
}

export default function SnippetGallery({ isOpen, onClose, onNavigateToSource }: SnippetGalleryProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [view, setView] = useState<SnippetView>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isMultiSelect, setIsMultiSelect] = useState(false)
  const [filter, setFilter] = useState<SnippetFilter>({})
  const [allTags, setAllTags] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSnippets()
      setAllTags(snippetStorage.getAllTags())
    }
  }, [isOpen, filter, searchQuery])

  const loadSnippets = () => {
    const filtered = snippetStorage.getFilteredSnippets({
      ...filter,
      searchQuery
    })
    setSnippets(filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()))
  }

  const handleDelete = (id: string) => {
    snippetStorage.deleteSnippet(id)
    loadSnippets()
    if (selectedSnippet?.id === id) {
      setSelectedSnippet(null)
    }
  }

  const handleBulkDelete = () => {
    snippetStorage.deleteMultiple(Array.from(selectedIds))
    setSelectedIds(new Set())
    setIsMultiSelect(false)
    loadSnippets()
  }

  const handleToggleStar = (snippet: Snippet) => {
    snippetStorage.updateSnippet(snippet.id, { starred: !snippet.starred })
    loadSnippets()
  }

  const handleExport = () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined
    const markdown = snippetStorage.exportAsMarkdown(ids)
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `snippets-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedIds(newSelection)
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Main Gallery Area */}
      <div className="flex-1 bg-dark-bg flex flex-col">
        {/* Header */}
        <header className="border-b border-dark-border/30 bg-dark-surface/95 backdrop-blur-sm">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-dark-elevated rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-text-muted" />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📚</span>
                  <h1 className="text-xl font-semibold text-text-primary">
                    Snippet Gallery
                  </h1>
                  <span className="text-sm text-text-muted">
                    ({snippets.length})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Multi-select toggle */}
                <button
                  onClick={() => {
                    setIsMultiSelect(!isMultiSelect)
                    setSelectedIds(new Set())
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isMultiSelect 
                      ? 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/30' 
                      : 'bg-dark-elevated text-text-muted hover:text-text-primary'
                  }`}
                >
                  {isMultiSelect ? 'Cancel Selection' : 'Select'}
                </button>

                {selectedIds.size > 0 && (
                  <>
                    <button
                      onClick={handleExport}
                      className="p-2 hover:bg-dark-elevated rounded-lg transition-colors"
                      title="Export selected"
                    >
                      <Download className="w-4 h-4 text-text-muted" />
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      className="p-2 hover:bg-dark-elevated rounded-lg transition-colors text-red-500"
                      title="Delete selected"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* View toggles */}
                <div className="flex items-center bg-dark-elevated rounded-lg p-1">
                  <button
                    onClick={() => setView('grid')}
                    className={`p-1.5 rounded transition-colors ${
                      view === 'grid' ? 'bg-dark-bubble text-text-primary' : 'text-text-muted'
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setView('list')}
                    className={`p-1.5 rounded transition-colors ${
                      view === 'list' ? 'bg-dark-bubble text-text-primary' : 'text-text-muted'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setView('calendar')}
                    className={`p-1.5 rounded transition-colors ${
                      view === 'calendar' ? 'bg-dark-bubble text-text-primary' : 'text-text-muted'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search snippets..."
                  className="w-full bg-dark-elevated/50 text-text-primary rounded-lg pl-10 pr-4 py-2 text-sm
                           border border-dark-border/30 focus:outline-none focus:border-cyan-500/50
                           placeholder:text-text-muted transition-all duration-200"
                />
              </div>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors
                          ${showFilters ? 'bg-cyan-500/20 text-cyan-500' : 'bg-dark-elevated text-text-muted'}`}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
            </div>

            {/* Filter Bar */}
            {showFilters && (
              <div className="mt-3 p-3 bg-dark-elevated/50 rounded-lg border border-dark-border/30">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setFilter({ ...filter, starred: !filter.starred })}
                    className={`px-3 py-1 rounded-full text-xs flex items-center gap-1 transition-colors
                              ${filter.starred ? 'bg-cyan-500/20 text-cyan-500' : 'bg-dark-bubble text-text-muted'}`}
                  >
                    <Star className="w-3 h-3" />
                    Starred
                  </button>
                  
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => {
                        const tags = filter.tags || []
                        const newTags = tags.includes(tag) 
                          ? tags.filter(t => t !== tag)
                          : [...tags, tag]
                        setFilter({ ...filter, tags: newTags })
                      }}
                      className={`px-3 py-1 rounded-full text-xs transition-colors
                                ${filter.tags?.includes(tag) 
                                  ? 'bg-cyan-500/20 text-cyan-500' 
                                  : 'bg-dark-bubble text-text-muted'}`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {snippets.map(snippet => (
                <div
                  key={snippet.id}
                  onClick={() => !isMultiSelect && setSelectedSnippet(snippet)}
                  className={`group relative bg-dark-surface border border-dark-border/30 rounded-lg p-4
                            hover:border-cyan-500/30 transition-all duration-200 cursor-pointer
                            ${selectedIds.has(snippet.id) ? 'ring-2 ring-cyan-500/50' : ''}`}
                >
                  {isMultiSelect && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelection(snippet.id)
                      }}
                      className="absolute top-3 left-3 w-5 h-5 rounded border-2 border-text-muted
                               flex items-center justify-center cursor-pointer hover:border-cyan-500"
                    >
                      {selectedIds.has(snippet.id) && (
                        <Check className="w-3 h-3 text-cyan-500" />
                      )}
                    </div>
                  )}

                  {snippet.starred && (
                    <Star className="absolute top-2 right-2 w-4 h-4 text-cyan-500 fill-cyan-500" />
                  )}

                  <h3 className={`font-medium text-text-primary mb-2 line-clamp-1 ${isMultiSelect ? 'ml-8' : ''}`}>
                    {snippet.title}
                  </h3>
                  
                  <p className={`text-sm text-text-muted line-clamp-3 mb-3 ${isMultiSelect ? 'ml-8' : ''}`}>
                    {snippet.preview}
                  </p>

                  <div className={`flex items-center justify-between ${isMultiSelect ? 'ml-8' : ''}`}>
                    <span className="text-xs text-text-muted">
                      {formatDate(snippet.createdAt)}
                    </span>
                    {snippet.tags.length > 0 && (
                      <div className="flex gap-1">
                        {snippet.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs px-2 py-0.5 bg-dark-elevated rounded-full text-cyan-500">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'list' && (
            <div className="space-y-2">
              {snippets.map(snippet => (
                <div
                  key={snippet.id}
                  onClick={() => !isMultiSelect && setSelectedSnippet(snippet)}
                  className={`flex items-start gap-4 p-4 bg-dark-surface border border-dark-border/30 
                            rounded-lg hover:border-cyan-500/30 transition-all duration-200 cursor-pointer
                            ${selectedIds.has(snippet.id) ? 'ring-2 ring-cyan-500/50' : ''}`}
                >
                  {isMultiSelect && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelection(snippet.id)
                      }}
                      className="w-5 h-5 rounded border-2 border-text-muted flex-shrink-0 mt-1
                               flex items-center justify-center cursor-pointer hover:border-cyan-500"
                    >
                      {selectedIds.has(snippet.id) && (
                        <Check className="w-3 h-3 text-cyan-500" />
                      )}
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-text-primary">{snippet.title}</h3>
                      {snippet.starred && (
                        <Star className="w-4 h-4 text-cyan-500 fill-cyan-500 flex-shrink-0 ml-2" />
                      )}
                    </div>
                    <p className="text-sm text-text-muted line-clamp-2 mb-2">{snippet.preview}</p>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-text-muted">{formatDate(snippet.createdAt)}</span>
                      <span className="text-xs text-accent-violet">{snippet.source.chatTitle}</span>
                      {snippet.tags.map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-dark-elevated rounded-full text-cyan-500">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedSnippet && (
        <div className="w-[500px] bg-dark-surface border-l border-dark-border/30 flex flex-col">
          <div className="p-4 border-b border-dark-border/30">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-text-primary line-clamp-1">
                {selectedSnippet.title}
              </h2>
              <button
                onClick={() => setSelectedSnippet(null)}
                className="p-1.5 hover:bg-dark-elevated rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleToggleStar(selectedSnippet)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm
                          transition-colors ${selectedSnippet.starred 
                            ? 'bg-cyan-500/20 text-cyan-500' 
                            : 'bg-dark-elevated text-text-muted hover:text-text-primary'}`}
              >
                <Star className={`w-4 h-4 ${selectedSnippet.starred ? 'fill-current' : ''}`} />
                Star
              </button>
              
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedSnippet.content)
                }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-dark-elevated 
                         rounded-lg text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>

              {onNavigateToSource && (
                <button
                  onClick={() => onNavigateToSource(
                    selectedSnippet.source.chatId,
                    selectedSnippet.source.messageId
                  )}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-dark-elevated 
                           rounded-lg text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Source
                </button>
              )}

              <button
                onClick={() => handleDelete(selectedSnippet.id)}
                className="p-2 bg-dark-elevated rounded-lg text-red-500 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4">
              <p className="text-xs text-text-muted mb-1">From: {selectedSnippet.source.chatTitle}</p>
              <p className="text-xs text-text-muted">
                {formatDate(selectedSnippet.createdAt)}
              </p>
            </div>

            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selectedSnippet.content}
              </ReactMarkdown>
            </div>

            {selectedSnippet.notes && (
              <div className="mt-6 p-3 bg-dark-elevated/50 rounded-lg">
                <p className="text-xs text-text-muted mb-1">Notes:</p>
                <p className="text-sm text-text-secondary">{selectedSnippet.notes}</p>
              </div>
            )}

            {selectedSnippet.tags.length > 0 && (
              <div className="mt-4 flex gap-2 flex-wrap">
                {selectedSnippet.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-1 bg-cyan-500/20 rounded-full text-cyan-500">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}