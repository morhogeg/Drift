/* eslint-disable react-refresh/only-export-components --
   This module co-locates the small CitationLink component with its parser and
   ReactMarkdown anchor factory; they're always used together and never hot-reload
   independently, so the fast-refresh constraint doesn't apply. */
/**
 * Evidence-lens citations — turn the inline [n] markers a grounded answer carries
 * into hover-revealable sources, using data already in the message (no API call).
 *
 * A grounded answer ends with a "**Sources**" list (`n. [title](uri)`), and its
 * body has inline `[[n]](uri)` markers. We parse the list into a number → source
 * map so each inline [n] can show its title + domain on hover.
 */
import React from 'react'

export interface CitedSource {
  title: string
  domain: string
  uri: string
}

/** Parse a grounded answer's "**Sources**" list into a number → source map. */
export function parseGroundingSources(text: string): Map<number, CitedSource> {
  const map = new Map<number, CitedSource>()
  const start = text.search(/\*\*Sources\*\*/i)
  if (start === -1) return map
  const section = text.slice(start)
  const re = /(\d+)\.\s*\[([^\]]*)\]\(([^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(section)) !== null) {
    const n = parseInt(m[1], 10)
    const uri = m[3]
    let domain = uri
    try { domain = new URL(uri).hostname.replace(/^www\./, '') } catch { /* keep raw uri */ }
    map.set(n, { title: (m[2] || '').trim() || domain, domain, uri })
  }
  return map
}

/** An inline [n] citation that reveals its source (title + domain) on hover. */
export function CitationLink({ href, n, source }: { href?: string; n: number; source?: CitedSource }) {
  return (
    <span className="group/cite relative inline-block align-baseline">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-accent-violet no-underline hover:underline"
      >[{n}]</a>
      {source && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-[260px] -translate-x-1/2
                     rounded-lg border border-dark-border/70 bg-dark-elevated/95 px-2.5 py-1.5 text-left shadow-xl shadow-black/40
                     backdrop-blur-md opacity-0 transition-opacity duration-150 group-hover/cite:opacity-100"
        >
          <span className="block text-[11px] font-semibold leading-snug text-text-primary line-clamp-3">{source.title}</span>
          <span className="mt-0.5 block text-[10px] text-accent-violet/80">{source.domain}</span>
        </span>
      )}
    </span>
  )
}

/**
 * A ReactMarkdown `a` renderer: inline [n] markers become a CitationLink with a
 * source tooltip; every other link stays a normal new-tab anchor. Pass the source
 * map parsed from the same message text.
 */
export function citationAnchor(sources: Map<number, CitedSource>) {
  return function Anchor({ href, children }: { href?: string; children?: React.ReactNode }) {
    const label = typeof children === 'string'
      ? children
      : Array.isArray(children) ? children.join('') : ''
    const cm = /^\[(\d+)\]$/.exec(label)
    if (cm) {
      const n = parseInt(cm[1], 10)
      return <CitationLink href={href} n={n} source={sources.get(n)} />
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-violet hover:underline">{children}</a>
  }
}
