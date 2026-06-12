import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CodeBlock } from './CodeBlock'

describe('CodeBlock', () => {
  it('wraps children in a <pre> and renders a copy button', () => {
    const html = renderToStaticMarkup(
      <CodeBlock>
        <code>const x = 42</code>
      </CodeBlock>
    )
    expect(html).toContain('<pre')
    expect(html).toContain('const x = 42')
    expect(html).toContain('aria-label="Copy code"')
    // Button is hover-revealed, not removed, so it's in the markup.
    expect(html).toContain('group/code')
  })
})
