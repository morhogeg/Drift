# FABLE Log — autonomous web-app session (Jun 10, 2026)

BASE: `feature/apple-level-overhaul` · Cap: 5 shipped branches · Queue: FABLE_QUEUE.md

---

## 1. Semantic resonance edges on the Drift Map

- **Branch:** `fable/map-semantic-edges` · **SHA:** `56327c9` · **Files:** `src/components/DriftKnowledgeGraph.tsx` (+142/−1)
- **Vision fit:** The map drew only lineage (a family tree). Dashed-cyan resonance edges between meaning-related drifts (embedding cosine ≥ 0.62) make cross-branch connections between ideas literally visible — the map becomes a knowledge map.
- **What it does:** Pairwise cosine over cached embedding vectors for laid-out drift nodes → dashed `#22d3ee` arcs between related cards. Excludes ancestor↔descendant + same-term lens threads; caps 8 edges / 2 per node. Edges dim with the filter, brighten when an endpoint is selected, carry a "Related by meaning: A ↔ B" tooltip; tiny legend appears bottom-left only when edges exist. Reduced-motion double-gated; zero edges (no-op) when no vectors/key.
- **Gates:**
  - A: build clean; main 294.06→294.13 kB (**+0.07 kB**); map lazy chunk 48.18 kB
  - B: self-review clean (on-brand cyan, graceful degrade, O(n²) fine at realistic sizes; known acceptable: same-column bows pass under cards exactly like rivers do; legend is English like all map chrome)
  - C: Playwright 7/7 — EN edge exactly between the related pair (orthogonal drift excluded), legend, tooltip, filter-dim → opacity 0, selection-brighten → 1.8px, HE edge + Hebrew tooltip. Screenshots: `/tmp/fable-map-en-happy.png`, `/tmp/fable-map-en-filtered.png`, `/tmp/fable-map-he.png`
  - D: regression 6/6 — main-chat reply render, 4 cards, 3 lineage rivers, filter keeps cards mounted, detail inspector, "Open this drift" → DriftPanel handoff (`/tmp/fable-map-gate-d-panel.png`). Synthesis/highlights untouched (zero diff in App.tsx/gemini.ts).
  - E: accent-discovery cyan #22d3ee, dashed vs solid-violet rivers, ambient 16s dash drift, no #007AFF anywhere
  - F: stated above
- **Revert:** `git branch -D fable/map-semantic-edges` (branch-only; BASE untouched)
- **Deferred follow-ups:** (a) map "focus mode" tracing a selected card's ancestry + resonance together; (b) hover/tap affordance to jump across a resonance edge to the other drift; (c) consider localizing map chrome (incl. legend) as one unit.

---

## 2. Recall marks on suggested highlights

- **Branch:** `fable/recall-highlights` · **SHA:** `8f21ad8` · **Files:** `src/App.tsx` (+29/−9), `src/index.css` (+22)
- **Vision fit:** Wandering becomes cumulative. When a new answer mentions a concept already drifted on (in any chat), the highlight says so — reading becomes re-encountering your own thinking, and one click resumes the prior exploration instead of duplicating it.
- **What it does:** In `processHighlightsText`, each suggested-highlight phrase gets an exact-normalized lookup against the memoized `termIndex`. Matches render as `.drift-suggestion-recall` — cyan dotted underline + superscript dot — with tooltip `Explored before — reopen "<title>"`; click routes through `handleOpenRelatedDrift` (reopens prior drift, persisted or temp). Non-matches keep the violet new-exploration treatment. Excludes the on-screen chat. Exact match only — no containment guessing, since the click navigates somewhere specific.
- **Gates:**
  - A: build clean; main 294.06→294.32 kB (**+0.26 kB**), CSS 124.41→124.75 kB
  - B: self-review clean (render-pure, O(1) per phrase, RTL-safe dot via `margin-inline-start`)
  - C: Playwright 8/8 — recall mark + tooltip + violet contrast + ≤1-underline-per-term + reopen-prior-conversation, EN and HE (RTL dot placement verified visually). Screenshots: `/tmp/fable-recall-en.png`, `/tmp/fable-recall-en-reopened.png`, `/tmp/fable-recall-he.png`, `/tmp/fable-recall-he-reopened.png`
  - D: regression 3/3 — plain suggestion still opens a NEW drift, inline drift links render, map intact (`/tmp/fable-recall-gate-d-newdrift.png`). Two earlier D1 failures were assertion bugs (sidebar lastMessage preview text matched the locator); behavior confirmed correct via screenshot both times before fixing the assertion.
  - E: accent-discovery cyan #22d3ee (cyan = link to existing knowledge, violet = new exploration); hover parity with the violet original
  - F: stated above
- **Revert:** `git branch -D fable/recall-highlights`
- **Deferred follow-ups:** (a) "Drift into" chips below messages are not recall-aware — a chip for an explored term still starts a fresh drift; chips should show the same cyan recall state and reopen; (b) recall could also surface *semantic* (not just exact-term) matches once a confidence affordance exists — exact-only was chosen because the click navigates.

---

## 3. Edit & regenerate a sent question

- **Branch:** `fable/edit-regenerate` · **SHA:** `75b48a0` · **Files:** `src/App.tsx` (+68), `src/hooks/useMessageStream.ts` (+35/−3)
- **Vision fit:** Exploration means revising the question. Editing a sent turn in place and regenerating from it keeps the trail of thought continuous instead of fragmenting it across new threads.
- **What it does:** Hover pencil on user turns (not drift-pushed ones) → inline textarea editor inside the gradient bubble (Enter submits, Escape cancels, hint: "Replies after this point will be regenerated"). Submit truncates everything after the turn and re-sends through the normal pipeline. `editAndRegenerate` in useMessageStream: mid-stream guard, composer-draft preservation, auto-retitle when the title derived from the edited first turn. Drift sessions born from discarded replies survive.
- **Gates:**
  - A: build clean; main 294.06→296.19 kB (**+2.13 kB**)
  - B: self-review clean
  - C: Playwright 12/12 with a fully mocked Gemini endpoint (zero real API calls) — affordance, pre-fill, Escape-cancel, truncate+regenerate, downstream discard, upstream untouched, persistence across reload, first-turn edit + retitle, drift survival (IDB-verified), Hebrew RTL editor + Hebrew regeneration. Screenshots: `/tmp/fable-edit-editor.png`, `/tmp/fable-edit-en-happy.png`, `/tmp/fable-edit-he.png`. One check (drift survival) initially asserted via sidebar DOM and failed because drifts nest collapsed under their root — rewritten to read IDB, which is the truthful claim.
  - D: regression 4/4 — normal send + composer clear, composer draft survives edit, map renders, surviving drift opens in panel
  - E: in-bubble white-on-gradient editor, standard hover affordance, 200ms, logical margins (RTL)
  - F: stated above
- **Revert:** `git branch -D fable/edit-regenerate`
- **Deferred follow-ups:** (a) optional confirm step when the discarded span contains drift links (currently silent — drifts survive but inline anchors vanish); (b) edit history / undo for the discarded turns; (c) edit affordance inside the drift panel's own turns (this feature covers the main chat only).

---

## 4. Personal "You explored" edges in the Connect lens

- **Branch:** `fable/connect-seeding` · **SHA:** `58787ff` · **Files:** `src/components/DriftPanel.tsx` (+51/−3)
- **Vision fit:** The Connect lens asked the AI for connections but ignored the user's own graph — the richest source. Personal edges put your prior drifts on the same rail as AI suggestions, making connections between your own ideas visible and one tap away.
- **What it does:** In the Connect chips view, up to 3 violet "You explored" edges (from the already-plumbed `relatedDrifts` term-index occurrences) lead the rail before the AI edges. Click reopens that prior drift directly — zero API calls. Same-normalized-term lens siblings are filtered (the sibling strip covers those); empty state now requires both AI and personal edges absent. Also fixed `onOpenRelatedDrift` being declared in DriftPanelProps but never destructured.
- **Gates:**
  - A: build clean; main 294.06→295.62 kB (**+1.56 kB**)
  - B: self-review clean (logical props → RTL mirroring, `relatedDrifts` undefined-safe, optional-chained handler, cap 3, lens-sibling filter)
  - C: Playwright 7/7 — EN personal edge + AI edges alongside + reopen prior drift; HE mirror incl. `dir="rtl"` container + Hebrew reopen. Screenshots: `/tmp/fable-connect-en.png`, `/tmp/fable-connect-en-reopened.png`, `/tmp/fable-connect-he.png`. One locator fix (lens pill needed `getByRole('button')` — a violet span "Connect" also matched); no feature-code change.
  - D: regression 5/5 — drift-lens conversation view intact, same-term drift excluded from personal edges, AI bridge edge opens a focused thread, back-to-chips keeps personal+AI edges AND the visited dot/border on the visited edge (verified visually, `/tmp/fable-connect-gate-d-back.png`), map smoke. Two initial FAILs were assertion bugs: bare `getByText('restaurateur')` matched the sidebar lastMessage preview (recurring pattern — behavior was correct), and `cards===6` assumed a global map when the map is scoped to the active chat's tree (verified with a clean-seed debug run: root+drift=2). Assertions fixed; feature code untouched.
  - E: violet #a855f7 (drift brand hue) = "yours" vs per-kind AI edge colors; shared rail geometry; GitBranch icon in tinted square matching AI iconography; 150–200ms, active:scale-[0.98], min-h 54px; no #007AFF
  - F: stated above
- **Revert:** `git branch -D fable/connect-seeding`
- **Deferred follow-ups:** (a) personal edges could carry a one-line preview of the prior drift's first answer; (b) semantic (embedding) matches beyond lexical term overlap — the map's resonance pairs (feature 1) could feed this; (c) "You explored" label is English like other lens chrome — localize lens chrome as one unit.

---

## 5. Recall-aware "Drift into" chips

- **Branch:** `fable/chip-recall` · **SHA:** `252b8be` · **Files:** `src/App.tsx` (+45/−17)
- **Vision fit:** The chip rail answered "where next?" but only ever forward — a chip for an already-explored term silently duplicated the drift. Recall-aware chips make the rail acknowledge where you've been, so exploration compounds instead of duplicating. Completes the deferred follow-up from feature 2, implemented independently on BASE.
- **What it does:** Each "Drift into" chip term gets an exact-normalized lookup against the memoized `termIndex`. Explored terms (in any chat) render as cyan chips with `title="Explored before — reopen \"<title>\""` and route through `handleOpenRelatedDrift` (zero API calls); unexplored terms keep the violet `handleStartDrift` chip unchanged. Recall chips set `dir` per term. Same-message explorations stay fully suppressed (upstream `explored` filter untouched).
- **Gates:**
  - A: build clean; main 294.06→295.04 kB (**+0.98 kB**)
  - B: self-review clean (render-pure O(1), exact match only — the click navigates; active-chat occurrence excluded; accepted asymmetry: ArrowUpRight not flipped in RTL, matching the existing violet chips)
  - C: Playwright 6/6 — cyan recall chip + violet preserved + recall reopens prior drift + violet still starts a NEW drift (cold-start prompt, no leak), Hebrew RTL chip + Hebrew reopen. Screenshots: `/tmp/fable-chips-en.png`, `/tmp/fable-chips-en-reopened.png`, `/tmp/fable-chips-he.png`, `/tmp/fable-chips-he-reopened.png`. No assertion or feature-code failures — first run green.
  - D: regression 4/4 — same-message explored term suppressed from chips, inline suggestion underline renders exactly once, inline drift link opens panel, map smoke
  - E: cyan-400 #22d3ee = link-to-existing-knowledge (consistent with feature 2's recall marks); identical chip geometry/motion; no #007AFF
  - F: stated above
- **Revert:** `git branch -D fable/chip-recall`
- **Deferred follow-ups:** (a) recall chips could carry the prior drift's title when it differs from the term; (b) if features 2 and 5 both merge, extract the shared `recallFor` into `termIndex.ts` (each branch is independent, so the 3-line lookup is duplicated by design); (c) flip the chip arrow icon in RTL for both chip variants as one chore.

---

# SESSION SUMMARY — Jun 10, 2026

**Cap reached: 5/5 passing feature branches shipped.** BASE `feature/apple-level-overhaul` untouched (still at `f531158`). Nothing merged, nothing pushed. All gates run in-browser via Playwright against a fully mocked Gemini endpoint — zero real API calls, the .env key never left the machine.

| # | Branch | SHA | What | Bundle Δ (main chunk) |
|---|--------|-----|------|----------|
| 1 | `fable/map-semantic-edges` | `0398648` | Dashed-cyan resonance edges between meaning-related drifts on the Knowledge Map | +0.07 kB |
| 2 | `fable/recall-highlights` | `8f21ad8` | Cyan recall marks on suggested highlights — click reopens the prior drift | +0.26 kB (+0.34 CSS) |
| 3 | `fable/edit-regenerate` | `75b48a0` | Edit a sent question in place, regenerate from that turn | +2.13 kB |
| 4 | `fable/connect-seeding` | `58787ff` | Personal "You explored" edges seed the Connect lens rail | +1.56 kB |
| 5 | `fable/chip-recall` | `252b8be` | "Drift into" chips reopen prior explorations instead of duplicating | +0.98 kB |

Total main-chunk impact if all five merge: **≈ +5.0 kB** (each measured independently against BASE's 294.06 kB).

**Abandoned attempts:** none — all five attempted features passed gates. (Several GATE C/D check failures along the way were assertion bugs — sidebar `lastMessage` previews polluting `getByText`, map being scoped to the active tree, lens-pill locator collision — each verified against screenshots/clean-seed debug runs before touching anything; feature code was never changed to satisfy a broken assertion.)

**Dropped at triage (logged in FABLE_QUEUE.md):** export/auth/key-proxy work (out of scope / server-side), theming chores incl. the pink-first overhaul (a designated separate task), anything multi-model (removed by decree), map focus-trace and double-click-to-drift (lost the slot-5 bake-off to chip-recall, which completed feature 2's story).

**Keep recommendations, ranked:**
1. **chip-recall (5)** + **recall-highlights (2)** — merge together; they're one idea (wandering becomes cumulative) covering both surfaces. Then extract shared `recallFor` into `termIndex.ts` (3-line cleanup).
2. **connect-seeding (4)** — biggest vision-per-line: the lens literally named "Connect" now connects to your own thinking first.
3. **edit-regenerate (3)** — table-stakes for an exploration tool; biggest bundle cost but pure UX win. Consider the deferred confirm-step when discarding spans containing drift links before TestFlight.
4. **map-semantic-edges (1)** — beautiful and cheap, but depends on the embedding cache being warm; verify on-device feel during the simulator pass.

**Unbuilt ideas worth a future run:** map focus-mode tracing ancestry+resonance of a selected card; semantic (embedding-based) recall for chips/highlights once a confidence affordance exists; jump-across-resonance-edge on the map; localizing lens/map/chip chrome as one unit; edit affordance inside the drift panel; per-drift "synthesis so far" pinned card.

**Security flags (not fixed, per brief):** the two exposed Gemini keys noted in memory remain a user action item (rotate + move client-side key usage behind a proxy eventually). `VITE_GEMINI_API_KEY` is still baked into the client bundle by design of the current architecture — flagged, not worked around.

**Housekeeping:** `.fable/` scripts + `FABLE_LOG.md`/`FABLE_QUEUE.md` are untracked scratch, never committed to any feature branch. Dev server was on port 5199 (`/tmp/drift-dev.log`).

---

# POST-SESSION REFINEMENT — Feature 1 tooltip (Jun 10, 2026, interactive)

After the autonomous run, live testing of the integration branch surfaced
issues with the map's resonance-edge tooltip. Fixed iteratively against user
feedback, all on `fable/map-semantic-edges` (amended into one commit, new SHA
`0398648`, superseding `56327c9`):

1. **Tooltip never appeared on hover.** The 1.1px dashed arc was too thin a
   target for the native `<title>` to trigger. Fix: each arc is now two stacked
   paths — the visible dashed arc (pointer-events off) plus a 16px-wide
   *transparent* hit-zone path that carries the tooltip — hoverable along its
   whole length.
2. **Tooltip looked like an OS system message, not part of the app.** Replaced
   the native `<title>` with a custom glass chip (`.dkg-restip`): compact dark
   background, discovery-cyan border + eyebrow echoing the cyan edge, per-term
   `dir="auto"` for EN/HE, max-width 220px with wrapping.
3. **Tooltip flew to the top-right corner instead of following the cursor.** It
   was anchored against `width`/`height` — which are the *virtual graph-canvas*
   dimensions (the full layout extent), not the visible viewport. Fix: capture
   the real container rect from `wrapRef` at hover time and anchor against that;
   the chip now hugs the cursor (grows left past the container mid-line, drops
   below only near the top edge) and never crosses the cursor or clips at an edge.

**Verification:** GATE C extended to 10/10 — hover at the arc's geometric
midpoint surfaces `.dkg-restip` with both terms, asserted in-viewport, ≤260px
wide, AND within 40px of the cursor (measured 17px); EN + Hebrew. GATE D map
regression 6/6. Bundle unchanged (294.13 kB on the branch). Screenshots:
`/tmp/fable-map-en-happy.png`, `/tmp/fable-map-he.png`.

**Updated Feature 1 SHA:** `0398648` (was `56327c9`). Revert unchanged:
`git branch -D fable/map-semantic-edges`.
