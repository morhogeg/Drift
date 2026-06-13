# Review Crew Summary — 2026-06-13 · snippet-save-handler

**Reviewed:** working-tree change to `src/components/SelectionTooltip.tsx`.

## Summary

The change introduced one critical regression: the `handleSave()` function body was gutted, removing the `snippetStorage.createSnippet(...)` call that is the sole persistence mechanism for the Save-to-Snippets flow. All three reviewers independently flagged this as a P0 — QA confirmed it via a failing smoke spec, code review traced every save entry-point (keyboard, touch, desktop) to the broken function, and the design review noted the now-orphaned `snippetStorage` import as a corroborating signal. Beyond the regression, the design review found five UI-quality issues: missing `active:` parity on desktop template buttons, raw font-size literals bypassing the type-scale tokens across four lines, and two mobile tap-target violations. Overall health is poor due to the P0 data-loss bug; the rest of the file is structurally sound.

## What needs to be done

- [x] **P0** — `handleSave()` drops every snippet silently; `snippetStorage.createSnippet(...)` call is missing — `src/components/SelectionTooltip.tsx:512-521` — fixed: restored the `snippetStorage.createSnippet(...)` call inside `handleSave()`; smoke spec "save a selection as a snippet persists it" passes again (6/6 green) (2026-06-13)
  - Repro/evidence: Select any AI reply text, click "Save selection to snippets" (desktop or touch), open Snippet Gallery — nothing saved, `drift_snippets` unchanged. Smoke spec "save a selection as a snippet persists it" fails. `snippetStorage` imported at line 4 but never called; `handleSave()` only calls `dismissTooltip()`, `removeAllRanges()`, `onSnippetSaved?.()`.
  - Fix sketch: Restore the `snippetStorage.createSnippet(data.text, { chatId, chatTitle, messageId, isFullMessage: false, timestamp })` call inside the `if (data)` block before `dismissTooltip()`. Keep `onSnippetSaved?.()` as the post-save UI refresh.
  - Effort: S
  - Source: QA + code-review + design

- [ ] **P1** — Desktop template buttons have `hover:border-*` tint with no `active:` equivalent; touch users get no color feedback — `src/components/SelectionTooltip.tsx:679`
  - Repro/evidence: On touch, tapping a template button (Simplify/Deep dive/Connect/Challenge) does not change border color; `ACTION_TINT` border strings have `hover:border-*` with no paired `active:border-*`.
  - Fix sketch: Add `active:border-{color}/40` to each value in the `ACTION_TINT` border map, matching the existing hover color.
  - Effort: S
  - Source: design

- [ ] **P2** — Desktop action row uses raw `text-[12px]`/`text-[11px]`/`text-[9px]` instead of type-scale tokens — `src/components/SelectionTooltip.tsx:641, 658, 681, 685`
  - Repro/evidence: Four classNames hard-code pixel font sizes bypassing the `text-tiny`/`text-meta`/`text-micro` tokens in `tailwind.config.js`.
  - Fix sketch: Replace each raw `text-[Xpx]` with the appropriate token (verify names against the Tailwind theme).
  - Effort: S
  - Source: design

- [ ] **P2** — Mobile template button label uses raw `text-[11px]` — `src/components/SelectionTooltip.tsx:579`
  - Fix sketch: Replace `text-[11px]` with `text-tiny`.
  - Effort: XS
  - Source: design

- [ ] **P2** — Mobile primary Drift button tap target ~39px (< 44px min) — `src/components/SelectionTooltip.tsx:556`
  - Fix sketch: Change `py-3` to `py-3.5` or add `min-h-[44px]`.
  - Effort: XS
  - Source: design

- [ ] **P2** — Mobile template buttons tap target height ~38px (< 44px min) — `src/components/SelectionTooltip.tsx:571`
  - Fix sketch: Add `min-h-[44px]`.
  - Effort: XS
  - Source: design
