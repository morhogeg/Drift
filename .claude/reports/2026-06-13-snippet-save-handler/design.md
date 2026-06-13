# Design / UX Review Report

**Change under review:** `src/components/SelectionTooltip.tsx`. Palette/motion source of truth: `DESIGN_SYSTEM.md` + `tailwind.config.js`.

## Findings

**[high] — SelectionTooltip / handleSave — Broken snippet-save: function body was gutted**
`src/components/SelectionTooltip.tsx:512–522`
`handleSave()` no longer calls `snippetStorage` — it only dismisses and calls `onSnippetSaved?.()`. The import at line 4 is now unused; the `S` shortcut, the touch "Save" button, and the desktop "Save" button all silently do nothing. Fix: restore the snippet construction and persistence call.

**[medium] — SelectionTooltip / desktop template buttons — hover styles with no active equivalent**
`src/components/SelectionTooltip.tsx:679`
`ACTION_TINT[t.type].border` resolves to a `hover:border-*` tint with no paired `active:border-*`. On touch, hover never fires, so tapping gives scale feedback only — no color confirmation. Fix: add `active:border-*` alongside each `hover:border-*`.

**[medium] — SelectionTooltip / desktop action row — raw font-size literals bypass type-scale tokens**
`src/components/SelectionTooltip.tsx:641, 658, 681, 685`
`text-[12px]` / `text-[11px]` / `text-[9px]` bypass the `text-tiny` / `text-meta` / `text-micro` tokens defined in `tailwind.config.js`. Fix: replace with the matching tokens.

**[low] — SelectionTooltip / mobile template buttons — raw `text-[11px]` label**
`src/components/SelectionTooltip.tsx:579` Fix: `text-tiny`.

**[low] — SelectionTooltip / mobile primary Drift button — tap target ~39px (< 44px)**
`src/components/SelectionTooltip.tsx:556` Fix: `py-3.5` or `min-h-[44px]`.

**[low] — SelectionTooltip / mobile template buttons — tap target height ~38px (< 44px)**
`src/components/SelectionTooltip.tsx:571` Fix: add `min-h-[44px]`.

**Verdict:** DESIGN REVIEW: 6 findings (high: 1, medium: 2, low: 3)
