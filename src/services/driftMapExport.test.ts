import { describe, it, expect } from 'vitest'
import { buildExportTree, buildShareableMapHtml } from './driftMapExport'
import type { ChatSession } from '@/types/chat'

const t = new Date('2026-06-12T10:00:00Z')

const chats: ChatSession[] = [
  {
    id: 'root',
    title: 'Why do leaves change color?',
    createdAt: t,
    messages: [
      { id: 'm1', text: 'Why do leaves change color?', isUser: true, timestamp: t },
      {
        id: 'm2',
        text: 'Chlorophyll breaks down in autumn…',
        isUser: false,
        timestamp: t,
        driftInfos: [
          { selectedText: 'Chlorophyll', driftChatId: 'd1', templateType: 'research' },
        ],
      },
    ],
  },
  {
    id: 'd1',
    title: 'Drift: Chlorophyll',
    createdAt: t,
    messages: [
      { id: 'd1m1', text: 'Deep dive into Chlorophyll', isUser: true, timestamp: t },
      { id: 'd1m2', text: 'Chlorophyll is the green pigment…', isUser: false, timestamp: t },
    ],
    metadata: { isDrift: true, parentChatId: 'root', sourceMessageId: 'm2', selectedText: 'Chlorophyll' },
  },
  {
    id: 'd2__challenge',
    title: 'Drift: pigment',
    createdAt: t,
    messages: [{ id: 'd2m1', text: 'Is that the whole story?', isUser: true, timestamp: t }],
    metadata: { isDrift: true, parentChatId: 'd1', sourceMessageId: 'd1m2', selectedText: 'green pigment' },
  },
]

describe('drift map export', () => {
  it('builds a nested tree with lens detection', () => {
    const tree = buildExportTree('root', chats)!
    expect(tree.phrase).toBe('Why do leaves change color?')
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].lens).toBe('research') // from driftInfos.templateType
    expect(tree.children[0].phrase).toBe('Chlorophyll')
    expect(tree.children[0].children[0].lens).toBe('challenge') // from id suffix
  })

  it('renders self-contained HTML with content and escapes markup', () => {
    const html = buildShareableMapHtml('root', [
      ...chats.slice(0, 1).map((c) => ({
        ...c,
        messages: [
          ...c.messages,
          { id: 'xss', text: '<script>alert(1)</script>', isUser: false, timestamp: t },
        ],
      })),
      ...chats.slice(1),
    ])!
    expect(html).toContain('Why do leaves change color?')
    expect(html).toContain('Deep dive') // lens tag label
    expect(html).toContain('Chlorophyll is the green pigment…')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toMatch(/src=|href="http/) // no external resources
  })

  it('returns null for an unknown root', () => {
    expect(buildShareableMapHtml('missing', chats)).toBeNull()
  })
})
