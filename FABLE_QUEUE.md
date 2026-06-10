# FABLE Queue — autonomous web-app session (Jun 10, 2026)

BASE branch: `feature/apple-level-overhaul` (clean at session start)
Cap: 5 shipped feature branches. Status legend: pending / in-progress / done / dropped.

## Queue (highest exploration-leverage first)

### 1. Semantic edges on the Drift Map — `fable/map-semantic-edges` [done — 56327c9]
- **Type:** new (explicit TODO at `DriftKnowledgeGraph.tsx:217`)
- **Vision fit:** The map exists to make connections between ideas visible, but today it only draws lineage (parent→child). Two branches that converged on the same *meaning* via different paths show no relationship. Faint "resonance" links between meaning-related drifts (embedding cosine ≥ SEMANTIC_THRESHOLD) turn the map from a family tree into an actual knowledge map.
- **Approach:** compute pairwise cosine over `getCachedVectors()` for the laid-out nodes; render dashed cyan arcs (accent-discovery, distinct from violet lineage rivers) between card edges for pairs above threshold and not already parent/child. Cap edges (top-N) to avoid clutter. Graceful no-op without vectors/key.
- **Risk:** M (visual clutter, perf on big maps — mitigate with cap + memo). **Effort:** M-L.

### 2. "Explored before" recall marks on highlights — `fable/recall-highlights` [done — 8f21ad8]
- **Type:** new
- **Vision fit:** Wandering should be cumulative. When a new AI answer mentions a concept you already drifted on (in any chat), the highlight should *say so* — a recall mark that turns reading into re-encountering your own thinking. Clicking it reopens the prior exploration instead of starting cold (no wasted tokens, no duplicated thought).
- **Approach:** in `processHighlightsText` (App.tsx), check each highlight phrase against the memoized `termIndex` (`findRelatedDrifts`). Matched terms render with a distinct cyan-tinted treatment + dot; click routes to `handleOpenRelatedDrift`-style reopen (existing path) rather than a fresh drift.
- **Risk:** S-M (render-pure constraints in that function). **Effort:** M.

### 3. Edit & re-ask a question — `fable/edit-regenerate` [done — 75b48a0]
- **Type:** new (on the project's pending list)
- **Vision fit:** Exploration means revising the question. Today a mis-aimed prompt forces a brand-new thread, fragmenting the trail of thought. Editing a sent message and regenerating from it keeps the exploration continuous and honest.
- **Approach:** edit affordance on user messages in main chat → textarea inline → on submit, truncate messages after that point and re-send through the existing stream pipeline. `updateMessage` exists in chatStore.
- **Risk:** M (stream pipeline, message truncation semantics, drift links on later messages). **Effort:** M.

### 4. Connect lens seeded with the user's own prior drifts — `fable/connect-seeding` [done — 58787ff]
- **Type:** improve (explicit TODO: "seed the Connect lens from semantic neighbors")
- **Vision fit:** Connect cards today are entirely the model's invention. The most meaningful connections are to *your own* prior explorations — seeding the Connect view with semantic-neighbor drifts makes the lens personal: "this links to something you explored last week."
- **Approach:** in the Connect card fetch path, look up semantic + lexical neighbors of the term (same machinery as relatedDrifts); inject them as a distinct card kind ("your exploration") that opens the existing drift (no API call) instead of a bridge question.
- **Risk:** M (useConnectThreads pipeline + card parse format). **Effort:** M.

### 5. Recall-aware "Drift into" chips — `fable/chip-recall` [done — 252b8be]
- Won the slot-5 bake-off: completes feature 2's story (recall on both highlight + chip surfaces) at S effort. Map focus-trace and double-click-to-drift remain unbuilt.

#### (original slot-5 candidates)
Candidates, in current preference order:
- **Drift-panel answer → "Drift into" chips parity**: panel answers already get `msgHighlights` underlines; verify chips parity and gaps in nested wandering. (improve, S)
- **Map: focus mode tracing a card's full ancestry+resonance** on select (improve, M)
- **Double-click-to-drift** gesture sugar (improve, S; risk of selection conflicts)

## Dropped / not doing (with why)
- **Export & Share, key-proxying, auth** — explicitly deferred by owner in HANDOFF.
- **Generic theming/perf chores** — no exploration leverage.
- **Multi-model anything** — broadcast removed by design (Jun 5); off-limits.
