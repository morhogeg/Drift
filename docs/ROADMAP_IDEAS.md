# Drift — Roadmap Ideas (Deferred)

These are higher-ambition directions surfaced during the product review. They are
**not built yet** — captured here so they aren't lost. Ordered roughly by leverage.
The current shipped work (first-run sample exploration, friendly deferred key,
save-surface cleanup) is the foundation several of these build on.

---

## 1. Editable Mind-Map Builder ⭐ (the big one)

Today the **Drift Map** is a read-only, AI-generated constellation of a conversation's
drifts. The idea: turn it into a **creation tool** — let the user *author* the map, not
just view it.

**What the user can do:**
- **Select / mark** specific nodes (multi-select) on the map.
- **Remove** nodes they don't care about (prune the constellation).
- **Add** their own nodes — a manual concept, a note, a question — not tied to a drift.
- **Edit** node labels and the relationship/edge labels between nodes.
- **Re-link / reshape**: draw new edges, regroup, reposition, cluster by theme.
- Mix **AI-generated** nodes (from drifts) and **user-authored** nodes in one canvas.

**Why it matters:** it promotes Drift from "AI gives you a readout" to "you build your
own understanding, with AI as raw material." It's the natural home for the curious-learner
ICP (study maps, research scaffolds) and it makes the map a durable artifact worth keeping.

**Synergies / notes:**
- Pairs directly with **Explorables (#2)**: author a map → publish/share it.
- The **seeded sample** machinery (`src/services/sampleExploration.ts`) already constructs
  drift trees as static data — an editable map is the same data shape made mutable, so the
  sample is a useful fixture/prototype for the editor.
- Likely needs: a node/edge model that allows user-authored nodes (extend the drift-tree
  walk in `src/services/driftMapExport.ts` / the graph in `DriftKnowledgeGraph.tsx`),
  persistence of manual layout + edits, and an editing UI layer (drag, inline rename,
  add/delete, connect).
- Open questions: do user edits live on the chat, or a separate "map document"? How do
  AI-regenerated drifts reconcile with a hand-edited map (merge vs. lock)?

---

## 2. Shareable "Explorables"

Publish a drift map + its synthesis as a **public, read-only artifact** with its own URL:
the question at the center, branches as an interactive map, synthesis on top, lens badges
intact.

**Why:** it's the missing **growth loop** — every shared Explorable showcases the paradigm
and pulls in new users; it also gives people a reason to explore deeply (you're building
something worth sharing).

**Leverage:** `src/services/driftMapExport.ts` already serializes the tree; this extends
export → hosted render. Pairs with the optional Firebase backend already wired in. Reuse
`cloudKeyStrip` / `backup` sanitization so **no key material ever lands in a share payload**.

---

## 3. Persistent "Curiosity Graph" (cross-chat knowledge graph)

Promote the per-conversation map to a **lifelong, cross-chat graph**: everything the user
ever drifted into becomes nodes in one evolving constellation, with semantic recall
(already built per-term) surfacing connections *between* conversations ("you explored
'entropy' three weeks ago in a different chat").

**Why:** the **retention / compounding-value moat** that linear chat assistants can't match
— they forget; Drift remembers and connects. Reframes the product from "a chat app" to
"a tool where your understanding accumulates."

**Leverage:** the embeddings cache, `driftResonance`, and the graph renderer already exist —
mostly a scope change (global vs. per-chat) plus cross-chat edge surfacing.

---

## 4. "Drift Copilot" (proactive, guided exploration)

After each answer, proactively surface the 2–3 highest-leverage places to drift next — the
surprising claim, the load-bearing assumption, the genuine tension — each pre-tagged with
the best lens ("Stress-test this," "Get the evidence"). Optional **Auto-Drift**: it explores
a few branches itself and presents them for the user to keep or discard.

**Why:** turns exploration from manual labor into a guided experience, raising depth per
session — the engagement multiplier and the most defensible "AI-native" surface.

**Leverage:** `getSuggestedHighlights` / `getDriftSuggestions` plumbing already exists
(currently fire-and-forget, silent on error); this elevates it into a primary, lens-aware UI.

---

## 5. Smaller follow-ups noted during review

- **Unify Snippets + "Keep as chat"** into a single "Library" concept (this pass only
  relabeled/disambiguated them; the deeper merge touches storage).
- **Snippet Calendar view** — the dead button was removed; a real calendar/heatmap could
  return as a deliberate feature (the `getSnippetsByDate` helper already exists).
- **Onboarding:** consider a hosted free-tier/proxy path (`src/services/proxyClient.ts` is
  implemented but unwired) so even the *first own question* needs no BYOK — costs money per
  user, so gated on a backend decision.
- **App.tsx / DriftPanel decomposition** (Tier B) — ongoing tech-debt paydown.
