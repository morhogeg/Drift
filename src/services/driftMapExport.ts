/**
 * driftMapExport — shareable read-only drift map.
 *
 * Builds a fully self-contained dark HTML page (inline CSS, no JS deps, no
 * network) from a root chat and its drift tree, so a map can be shared as a
 * single file today and as a hosted link once cloud sync exists. The export
 * is built from the same persisted shapes the in-app map uses (ChatSession
 * metadata.parentChatId chains + driftInfos), independent of React.
 */

import type { ChatSession, Message } from '@/types/chat'

export interface ExportNode {
  id: string
  /** The highlighted phrase this drift branched from (root: chat title). */
  phrase: string
  lens: 'drift' | 'simplify' | 'research' | 'connect' | 'challenge'
  messages: { isUser: boolean; text: string }[]
  children: ExportNode[]
}

const LENS_LABELS: Record<ExportNode['lens'], string> = {
  drift: 'Drift',
  simplify: 'Simplify',
  research: 'Deep dive',
  connect: 'Connect',
  challenge: 'Challenge',
}

const LENS_COLORS: Record<ExportNode['lens'], string> = {
  drift: '#a855f7',
  simplify: '#f59e0b',
  research: '#3b82f6',
  connect: '#06b6d4',
  challenge: '#f43f5e',
}

function lensOf(chat: ChatSession, allChats: ChatSession[]): ExportNode['lens'] {
  // Composite lens threads carry their lens as an id suffix (`<base>__research`).
  const m = chat.id.match(/__(simplify|research|connect|challenge)$/)
  if (m) return m[1] as ExportNode['lens']
  // The first lens for a term is recorded on the parent message's driftInfos.
  for (const c of allChats) {
    for (const msg of c.messages) {
      const di = msg.driftInfos?.find((d) => d.driftChatId === chat.id)
      if (di?.templateType) return di.templateType
    }
  }
  return 'drift'
}

/** Build the export tree for one root chat. */
export function buildExportTree(
  rootId: string,
  allChats: ChatSession[],
  getTempMessages?: (chatId: string) => Message[] | null,
): ExportNode | null {
  const root = allChats.find((c) => c.id === rootId)
  if (!root) return null

  const childrenOf = (parentId: string): ChatSession[] =>
    allChats.filter((c) => c.metadata?.isDrift && c.metadata.parentChatId === parentId)

  const toNode = (chat: ChatSession, phrase: string, depth: number): ExportNode => ({
    id: chat.id,
    phrase,
    lens: depth === 0 ? 'drift' : lensOf(chat, allChats),
    messages: (chat.messages?.length ? chat.messages : (getTempMessages?.(chat.id) ?? []))
      .filter((m) => !m.isHiddenContext && !m.text.startsWith('📌'))
      .map((m) => ({ isUser: m.isUser, text: m.text })),
    children: childrenOf(chat.id).map((c) =>
      toNode(c, c.metadata?.selectedText || c.title, depth + 1)
    ),
  })

  return toNode(root, root.title, 0)
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderNode(node: ExportNode, depth: number): string {
  const color = LENS_COLORS[node.lens]
  const msgs = node.messages
    .map(
      (m) => `<div class="msg ${m.isUser ? 'user' : 'ai'}">${esc(m.text)}</div>`
    )
    .join('\n')
  const children = node.children.map((c) => renderNode(c, depth + 1)).join('\n')
  const tag =
    depth === 0
      ? `<span class="tag root">Exploration</span>`
      : `<span class="tag" style="color:${color};border-color:${color}55;background:${color}14">${LENS_LABELS[node.lens]}</span>`
  return `
<details class="node" ${depth < 2 ? 'open' : ''} style="--lens:${color}">
  <summary>${tag}<span class="phrase">${esc(node.phrase)}</span><span class="count">${node.messages.length || ''}</span></summary>
  <div class="body">
    ${msgs}
    ${children}
  </div>
</details>`
}

/** Render a root chat's drift tree as a self-contained shareable HTML page. */
export function buildShareableMapHtml(
  rootId: string,
  allChats: ChatSession[],
  getTempMessages?: (chatId: string) => Message[] | null,
): string | null {
  const tree = buildExportTree(rootId, allChats, getTempMessages)
  if (!tree) return null
  const exportedAt = new Date().toISOString().slice(0, 10)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tree.phrase)} — Drift map</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px 64px; background: #0a0a0a; color: #fff;
         font: 15px/1.6 -apple-system, 'Inter', system-ui, sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0 0 4px;
       background: linear-gradient(90deg, #ff006e, #a855f7); -webkit-background-clip: text;
       background-clip: text; color: transparent; display: inline-block; }
  .sub { color: #6b7280; font-size: 12.5px; margin-bottom: 28px; }
  .node { margin: 10px 0; border: 1px solid #27272a; border-radius: 14px;
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); }
  .node .node { margin: 10px 0 0; border-left: 2px solid var(--lens); }
  summary { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer;
            list-style: none; }
  summary::-webkit-details-marker { display: none; }
  .tag { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
         padding: 2px 8px; border-radius: 999px; border: 1px solid; flex-shrink: 0; }
  .tag.root { color: #fff; border: none; background: linear-gradient(90deg, #ff006e, #a855f7); }
  .phrase { font-weight: 550; }
  .count { margin-left: auto; color: #6b7280; font-size: 12px; }
  .body { padding: 4px 16px 14px; }
  .msg { padding: 10px 14px; border-radius: 12px; margin: 8px 0; white-space: pre-wrap;
         overflow-wrap: anywhere; }
  .msg.user { background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.25); }
  .msg.ai { background: #161616; border: 1px solid #222; color: #d4d4d8; }
  .foot { margin-top: 36px; color: #52525b; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(tree.phrase)}</h1>
  <div class="sub">A Drift exploration map · exported ${exportedAt}</div>
  ${renderNode(tree, 0)}
  <div class="foot">Made with Drift — conversations that branch.</div>
</div>
</body>
</html>`
}

/** Trigger a download of the shareable map (browser/WebView contexts). */
export function downloadShareableMap(
  rootId: string,
  allChats: ChatSession[],
  getTempMessages?: (chatId: string) => Message[] | null,
): boolean {
  const html = buildShareableMapHtml(rootId, allChats, getTempMessages)
  if (!html) return false
  const title = allChats.find((c) => c.id === rootId)?.title ?? 'drift-map'
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'drift-map'
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-drift-map.html`
  a.click()
  URL.revokeObjectURL(url)
  return true
}
