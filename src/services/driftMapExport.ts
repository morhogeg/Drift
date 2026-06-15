/**
 * driftMapExport — shareable read-only drift map.
 *
 * Builds a fully self-contained dark HTML page (inline CSS, no external JS, no
 * network) from a root chat and its drift tree, so a map can be shared as a
 * single file today and as a hosted link once cloud sync exists. The export
 * is built from the same persisted shapes the in-app map uses (ChatSession
 * metadata.parentChatId chains + driftInfos), independent of React.
 *
 * A book-style Contents sidebar lets the reader jump between drifts; a tiny
 * inline (dependency-free, offline) script expands any collapsed ancestors of
 * the jump target so the link always lands somewhere visible.
 */

import type { ChatSession, Message } from '@/types/chat'

export interface ExportNode {
  id: string
  /** The highlighted phrase this drift branched from (root: chat title). */
  phrase: string
  lens: 'drift' | 'simplify' | 'research' | 'connect' | 'challenge' | 'evidence'
  messages: { isUser: boolean; text: string }[]
  children: ExportNode[]
}

const LENS_LABELS: Record<ExportNode['lens'], string> = {
  drift: 'Drift',
  simplify: 'Simplify',
  research: 'Deep dive',
  connect: 'Connect',
  challenge: 'Second opinion',
  evidence: 'Evidence',
}

const LENS_COLORS: Record<ExportNode['lens'], string> = {
  drift: '#a855f7',
  simplify: '#f59e0b',
  research: '#3b82f6',
  connect: '#06b6d4',
  challenge: '#f43f5e',
  evidence: '#8b5cf6',
}

function lensOf(chat: ChatSession, allChats: ChatSession[]): ExportNode['lens'] {
  // Composite lens threads carry their lens as an id suffix (`<base>__research`).
  const m = chat.id.match(/__(simplify|research|connect|challenge|evidence)$/)
  if (m) return m[1] as ExportNode['lens']
  // The first lens for a term is recorded on the parent message's driftInfos.
  // templateType is a LensKey — a custom lens id we don't render falls back to 'drift'.
  for (const c of allChats) {
    for (const msg of c.messages) {
      const di = msg.driftInfos?.find((d) => d.driftChatId === chat.id)
      if (di?.templateType) return (di.templateType in LENS_LABELS) ? (di.templateType as ExportNode['lens']) : 'drift'
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

/**
 * Minimal, self-contained markdown → safe HTML. Handles the subset the chat
 * actually produces: headings, bold/italic, inline code, bullet/numbered lists,
 * and paragraphs. Text is HTML-escaped FIRST — the markdown tokens (* # `) are
 * unaffected by escaping, so the regex passes stay safe against injection.
 */
function mdToHtml(raw: string): string {
  const inline = (s: string): string =>
    esc(s)
      // Inline [[n]](url) citation markers → a small superscript link (hides the
      // long grounding-redirect URL behind a tidy "n").
      .replace(/\[\[(\d+)\]\]\(([^)\s]+)\)/g, '<sup class="cite"><a href="$2" target="_blank" rel="noopener noreferrer">$1</a></sup>')
      // Ordinary [text](url) links (e.g. the Sources list) → real anchors.
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')

  const lines = raw.replace(/\r/g, '').split('\n')
  const out: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  const flush = () => {
    if (list) {
      out.push(`<${list.type}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.type}>`)
      list = null
    }
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) { flush(); continue }

    const heading = t.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flush()
      const level = Math.min(heading[1].length + 1, 6) // scale down: ## → h3 inside a card
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    const bullet = t.match(/^[-*+]\s+(.*)$/)
    if (bullet) {
      if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] } }
      list.items.push(inline(bullet[1]))
      continue
    }

    const numbered = t.match(/^\d+\.\s+(.*)$/)
    if (numbered) {
      if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [] } }
      list.items.push(inline(numbered[1]))
      continue
    }

    flush()
    out.push(`<p>${inline(t)}</p>`)
  }
  flush()
  return out.join('\n')
}

/** A stable, fragment-safe DOM id for a node (anchor target). */
function anchorId(id: string): string {
  return 'n-' + id.replace(/[^A-Za-z0-9_-]/g, '-')
}

/**
 * Dominant writing direction of the whole map — drives the page layout (the
 * Contents sidebar sits on the reading-start side, header aligns with it).
 * Per-message text still uses dir="auto", so mixed-language maps stay correct;
 * this only decides which side the chrome lives on.
 */
const RTL_RANGE = /[֐-׿؀-ۿ܀-߿יִ-﷽ﹰ-ﻼ]/
function mapDirection(tree: ExportNode): 'rtl' | 'ltr' {
  let rtl = 0
  let ltr = 0
  const scan = (s: string) => {
    for (const ch of s) {
      if (RTL_RANGE.test(ch)) rtl++
      else if (/[A-Za-z]/.test(ch)) ltr++
    }
  }
  const walk = (n: ExportNode) => {
    scan(n.phrase)
    n.messages.forEach((m) => scan(m.text))
    n.children.forEach(walk)
  }
  walk(tree)
  return rtl > ltr ? 'rtl' : 'ltr'
}

function countNodes(node: ExportNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
}

/** Book-style nested Contents entries — one link per drift, jumps via anchor. */
function buildToc(node: ExportNode, depth: number): string {
  const dot = depth === 0 ? '#a855f7' : LENS_COLORS[node.lens]
  const lens = depth === 0 ? '' : `<span class="toc-lens">${LENS_LABELS[node.lens]}</span>`
  const kids = node.children.length
    ? `<ul>${node.children.map((c) => buildToc(c, depth + 1)).join('')}</ul>`
    : ''
  return `<li>
    <a href="#${anchorId(node.id)}" dir="auto"><span class="dot" style="background:${dot}"></span><span class="toc-text">${esc(node.phrase)}</span>${lens}</a>
    ${kids}
  </li>`
}

function renderNode(node: ExportNode, depth: number): string {
  const color = LENS_COLORS[node.lens]
  const msgs = node.messages
    .map((m) => {
      const role = m.isUser ? 'question' : 'answer'
      const label = m.isUser ? 'Question' : 'Answer'
      return `<div class="msg ${m.isUser ? 'user' : 'ai'}">
        <span class="role" data-role="${role}">${label}</span>
        <div class="prose" dir="auto">${mdToHtml(m.text)}</div>
      </div>`
    })
    .join('\n')

  const children = node.children.length
    ? `<div class="branches">
         <div class="branches-head">${node.children.length} ${node.children.length === 1 ? 'branch' : 'branches'}</div>
         ${node.children.map((c) => renderNode(c, depth + 1)).join('\n')}
       </div>`
    : ''

  const tag =
    depth === 0
      ? `<span class="tag root">Exploration</span>`
      : `<span class="tag lens" style="color:${color}b0">${LENS_LABELS[node.lens]}</span>`

  return `
<details id="${anchorId(node.id)}" class="node depth-${Math.min(depth, 4)}" ${depth < 2 ? 'open' : ''} style="--lens:${color}">
  <summary><span class="caret" aria-hidden="true"></span>${tag}<span class="phrase" dir="auto">${esc(node.phrase)}</span></summary>
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
  const dir = mapDirection(tree)
  return `<!doctype html>
<html lang="en" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tree.phrase)} — Drift map</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; padding: 32px 16px 64px; background: #0a0a0a; color: #fff;
         font: 15px/1.65 -apple-system, 'Inter', system-ui, sans-serif; }

  /* ── Page layout: Contents sidebar + content ─────────────────────────── */
  .page { max-width: 1060px; margin: 0 auto; display: flex; gap: 30px; align-items: flex-start; }
  .wrap { flex: 1 1 auto; min-width: 0; max-width: 760px; }
  .node { scroll-margin-top: 16px; }

  /* ── Contents (book-style table of contents) ─────────────────────────── */
  .toc { position: sticky; top: 24px; flex: 0 0 250px; max-height: calc(100vh - 48px); overflow: auto;
         border: 1px solid #222; border-radius: 14px; padding: 12px 8px 14px 14px;
         background: rgba(255,255,255,0.022); }
  .toc > summary { list-style: none; cursor: pointer; font-size: 10px; letter-spacing: 0.14em;
                   text-transform: uppercase; color: #6b7280; font-weight: 700; padding: 2px 2px 0; }
  .toc > summary::-webkit-details-marker { display: none; }
  .toc ul { list-style: none; margin: 8px 0 0; padding: 0; }
  .toc ul ul { margin-inline-start: 9px; padding-inline-start: 9px; border-inline-start: 1px solid #262626; }
  .toc li { margin: 1px 0; }
  .toc a { display: flex; gap: 7px; align-items: baseline; color: #a1a1aa; text-decoration: none;
           padding: 4px 7px; border-radius: 8px; font-size: 12.5px; line-height: 1.4; }
  .toc a:hover { background: rgba(255,255,255,0.06); color: #fff; }
  .toc .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; transform: translateY(1px); }
  .toc .toc-text { overflow-wrap: anywhere; }
  .toc .toc-lens { margin-inline-start: auto; padding-inline-start: 6px; font-size: 9px; font-weight: 700;
                   letter-spacing: 0.06em; text-transform: uppercase; color: #52525b; flex-shrink: 0; }

  h1 { font-size: 22px; letter-spacing: -0.02em; margin: 0 0 4px;
       background: linear-gradient(90deg, #ff006e, #a855f7); -webkit-background-clip: text;
       background-clip: text; color: transparent; display: inline-block; }
  .sub { color: #6b7280; font-size: 12.5px; margin-bottom: 28px; }

  /* ── Node card (one drift) ───────────────────────────────────────────── */
  .node { margin: 12px 0; border: 1px solid #27272a; border-radius: 14px;
          background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)); }
  /* Nested drifts get a lens-colored rail on the inline-start edge (RTL-safe). */
  .branches > .node { margin: 10px 0 0; border-inline-start: 3px solid var(--lens); }
  summary { display: flex; align-items: center; gap: 10px; padding: 13px 16px; cursor: pointer;
            list-style: none; }
  summary::-webkit-details-marker { display: none; }
  .caret { width: 7px; height: 7px; border-right: 2px solid #6b7280; border-bottom: 2px solid #6b7280;
           transform: rotate(-45deg); transition: transform .15s; flex-shrink: 0; opacity: .7; }
  details[open] > summary .caret { transform: rotate(45deg); }
  .tag { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
         padding: 3px 9px; border-radius: 999px; border: 1px solid; flex-shrink: 0; }
  .tag.root { color: #fff; border: none; background: linear-gradient(90deg, #ff006e, #a855f7); }
  /* Lens tags read as quiet labels (calmer, content-first — matching the app). */
  .tag.lens { border: none; padding: 0; font-size: 9px; font-weight: 600; letter-spacing: 0.1em; }
  .phrase { font-weight: 600; font-size: 15px; min-width: 0; overflow-wrap: anywhere; }
  .body { padding: 2px 16px 16px; }

  /* ── Messages: question vs answer ────────────────────────────────────── */
  .msg { position: relative; padding: 12px 14px 13px; border-radius: 12px; margin: 10px 0; }
  .msg.user { background: rgba(168,85,247,0.13); border: 1px solid rgba(168,85,247,0.28); }
  .msg.ai   { background: #151515; border: 1px solid #222; }
  .role { display: inline-block; font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; margin-bottom: 6px; }
  .role[data-role="question"] { color: #c4b5fd; }
  .role[data-role="answer"]   { color: #6b7280; }

  /* ── Rendered markdown (RTL-aware via dir="auto") ────────────────────── */
  .prose { unicode-bidi: plaintext; text-align: start; color: #e4e4e7; }
  .msg.ai .prose { color: #d4d4d8; }
  .prose > :first-child { margin-top: 0; }
  .prose > :last-child { margin-bottom: 0; }
  .prose p { margin: 9px 0; }
  .prose h2, .prose h3, .prose h4 { margin: 16px 0 6px; line-height: 1.35; color: #fafafa;
                                    font-weight: 650; }
  .prose h2 { font-size: 16px; } .prose h3 { font-size: 14.5px; } .prose h4 { font-size: 13.5px; }
  .prose ul, .prose ol { margin: 8px 0; padding-inline-start: 1.4em; }
  .prose li { margin: 4px 0; }
  .prose strong { color: #fff; font-weight: 650; }
  .prose code { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 5px;
                font-size: 0.88em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .prose a { color: #a78bfa; text-decoration: none; border-bottom: 1px solid rgba(167,139,250,0.3);
             word-break: break-word; }
  .prose a:hover { border-bottom-color: #a78bfa; }
  .prose sup.cite { font-size: 0.72em; line-height: 0; margin-inline-start: 1px; }
  .prose sup.cite a { border-bottom: none; padding: 0 1px; font-weight: 600; }

  /* ── Branch grouping ─────────────────────────────────────────────────── */
  .branches { margin-top: 14px; padding-top: 4px; border-top: 1px dashed #2a2a2a; }
  .branches-head { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
                   color: #52525b; margin: 8px 0 2px; }

  .foot { margin-top: 36px; color: #52525b; font-size: 12px; text-align: center; }

  /* On narrow screens the Contents collapses inline above the content. */
  @media (max-width: 900px) {
    .page { flex-direction: column; gap: 16px; }
    .toc { position: static; flex: none; width: 100%; max-height: none; }
  }
</style>
</head>
<body>
<div class="page">
  ${
    countNodes(tree) >= 3
      ? `<details class="toc" open>
    <summary>Contents</summary>
    <ul>${buildToc(tree, 0)}</ul>
  </details>`
      : ''
  }
  <main class="wrap">
    <h1>${esc(tree.phrase)}</h1>
    <div class="sub">A Drift exploration map · exported ${exportedAt}</div>
    ${renderNode(tree, 0)}
    <div class="foot">Made with Drift — conversations that branch.</div>
  </main>
</div>
<script>
/* Contents jumps: open any collapsed ancestors of the target so the link
   always lands somewhere visible. Dependency-free; runs offline. */
(function () {
  function openTo(el) { for (var p = el; p; p = p.parentElement) { if (p.tagName === 'DETAILS') p.open = true } }
  function go() {
    var id = decodeURIComponent((location.hash || '').slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (el) { openTo(el); el.scrollIntoView(); }
  }
  window.addEventListener('hashchange', go);
  if (location.hash) setTimeout(go, 0);
})();
</script>
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
