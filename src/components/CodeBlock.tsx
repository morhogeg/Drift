/**
 * CodeBlock — a fenced-code <pre> with a hover copy button.
 *
 * Drop-in `pre` override for react-markdown. Reads the text content of the
 * rendered code, copies it on click, and shows a transient "Copied" state.
 * Styling matches the existing prose-pre treatment (dark bg, hairline border).
 */

import { useRef, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { haptics } from '@/lib/haptics'

export function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = async () => {
    const text = preRef.current?.innerText ?? ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text.replace(/\n$/, ''))
      haptics.impact('light')
      setCopied(true)
      if (resetRef.current) clearTimeout(resetRef.current)
      resetRef.current = setTimeout(() => setCopied(false), 1600)
    } catch (err) {
      console.error('[CodeBlock] copy failed:', err)
    }
  }

  return (
    <div className="group/code relative">
      <button
        onClick={copy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md px-2 py-1
                   text-[11px] font-medium opacity-0 group-hover/code:opacity-100 focus:opacity-100
                   bg-dark-elevated/80 border border-dark-border/60 text-text-secondary
                   hover:text-text-primary hover:bg-dark-elevated transition-all"
        aria-label={copied ? 'Copied' : 'Copy code'}
        title={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  )
}
