# QA Report — Quinn

**Change under review:** working-tree edit to `src/components/SelectionTooltip.tsx` (`handleSave()`).
**Dev server:** http://localhost:5199

## Scripted smoke
`npx playwright test` — **FAIL**: spec `save a selection as a snippet persists it` failed; the other 5 specs passed.

## Interactive pass — 1 finding

### P0 — Save to Snippets does nothing
- **Flow:** Text selection → selection tooltip → "Save selection to snippets" button.
- **Repro steps:**
  1. Open the app with an existing AI reply.
  2. Select text in the AI reply — the selection tooltip appears.
  3. Click the "Save selection to snippets" button.
  4. Open Snippet Gallery.
- **Expected:** The selected text is saved as a new snippet and appears in the gallery; `drift_snippets` in localStorage grows by 1.
- **Actual:** The tooltip dismisses and the selection clears, but no snippet is created. `drift_snippets` stays empty. The `snippetStorage.createSnippet(...)` call was deleted from `handleSave()`, leaving only the UI teardown. `onSnippetSaved` (App.tsx) only refreshes the count — it does not persist.
- **Likely source:** `src/components/SelectionTooltip.tsx:512–521`.

**Verdict:** SMOKE: fail (1/6 failed) · INTERACTIVE: 1 finding (P0: 1, P1: 0, P2: 0)
