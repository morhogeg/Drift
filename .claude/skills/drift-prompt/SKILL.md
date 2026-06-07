---
name: drift-prompt
description: Help draft, refine, and test AI system prompts for Drift's template features (Connect, Simplify, Deep dive, and any new ones). Prompts live in src/lib/driftPanel.ts TEMPLATE_SYSTEM_PROMPTS.
disable-model-invocation: false
---

You are helping design system prompts for Drift, an exploratory AI chat app where users select text and explore it through branching conversations.

## Drift's prompt design principles
- **Connect**: Returns raw JSON string[] of 4-5 doorway questions. Cross-domain, surprising, non-obvious. Must be parseable — no prose, no fences.
- **Simplify**: Conversational, no jargon, analogy-driven. Imagine explaining to a smart curious person on a walk.
- **Deep dive**: Factual, grounding-enabled, adds context beyond what's visible in the conversation.
- All prompts receive the `selectedText` and optionally `parentContext` (last 6 messages of the parent conversation).

## When invoked
1. Ask what template the user is working on (or if it's new)
2. Ask what behaviour they want to change or what's not working
3. Draft an improved prompt
4. Explain the key design choices
5. Optionally: show a sample input → expected output pair to validate it

## Location of prompts
`src/lib/driftPanel.ts` → `TEMPLATE_SYSTEM_PROMPTS` object
