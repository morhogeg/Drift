# Code Review Report

**Diff under review:** `git diff HEAD` — `src/components/SelectionTooltip.tsx` (`.claude/settings.local.json` permission additions ignored).

## P0 — `src/components/SelectionTooltip.tsx:517`

The diff deletes the entire `snippetStorage.createSnippet(...)` call from inside `handleSave()`, leaving only `dismissTooltip()`, `removeAllRanges()`, and `onSnippetSaved?.()`. `onSnippetSaved` in `App.tsx` is `() => uiStore.setSnippetCount(snippetStorage.getAllSnippets().length)` — it only refreshes the count, it does not persist anything. The result: every "Save selection to snippets" action (keyboard `S`, touch button, desktop button) now silently drops the user's selection. All previously working save paths are broken. The `snippetStorage` import at line 4 is now unused.

**Suggested fix:** Restore the deleted block immediately before `dismissTooltip()`:
```ts
snippetStorage.createSnippet(data.text, {
  chatId: currentChatId,
  chatTitle: currentChatTitle,
  messageId: data.messageId,
  isFullMessage: false,
  timestamp: new Date(),
})
```

**Verdict:** CODE REVIEW: 1 finding (P0: 1, P1: 0, P2: 0)
