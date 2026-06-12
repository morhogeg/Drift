# AI Review Crew for Drift — Implementation Plan

> **Status:** approved plan, not yet implemented. To build it, open a session in this repo and say:
> _"Implement the plan in `docs/plans/ai-review-crew.md`."_
>
> _Revised 2026-06-12 after a verification pass against the codebase: reuse the existing `.fable/` Playwright harness, add the missing `@playwright/test` dep, defer design tokens to `DESIGN_SYSTEM.md`/`tailwind.config.js`, account for the PostToolUse auto-build hook, and standardize on dev-server port 5199._

## Context

Build a set of role-based AI agents for the Drift repo — a QA tester who opens the app after changes, clicks around, and reports back; a product manager who accumulates feedback from all agents and summarizes what needs to be done; plus code and design reviewers. The goal: a repeatable "review crew" producing one prioritized action list, **and** a downtime skill (`/work-the-list`) that picks items off that list and fixes them while the user is away.

Drift already uses Claude Code customization (subagent `.claude/agents/mobile-ui-reviewer.md`, skills `.claude/skills/ios-preview/`, `.claude/skills/drift-prompt/`). This plan extends those existing patterns — match their file format and conventions.

### Decisions locked with the user
- **QA "hands": hybrid.** Playwright MCP (`@playwright/mcp` — free, open-source, runs locally via npx) for live interactive clicking of the *changed feature*, plus a scripted Playwright smoke spec for routine regression flows.
- **Roster:** QA Tester, Product Manager, Code Reviewer, Design/UX Reviewer.
- **Trigger:** manual `/review-feature` command.
- **Output:** tracked Markdown files in `.claude/reports/` **and** PM summary echoed in chat.
- **Downtime skill:** `/work-the-list` — loads latest reports, picks top-priority items, fixes them.
- **Every reported issue must include file paths** (`file:line` where known) so fixes need no re-discovery.
- **Agent model:** all subagents run on `fable` with **low reasoning effort** (set via frontmatter if the running Claude Code version supports an effort field; otherwise instruct concise, decisive behavior in the agent prompt).

### Key mechanics / constraints
- **Personas = subagents** (`.claude/agents/*.md`): YAML frontmatter (`name`, `description`, `tools`, `model`) + Markdown system prompt. Run in isolated contexts, parallelizable.
- **Subagents can't spawn subagents** — the `/review-feature` skill orchestrates from the top-level session; the PM agent is an aggregator, not a dispatcher.
- Playwright `v1.60.0` (the bare `playwright` package) is in devDependencies but unwired: no `playwright.config.ts`, `e2e/entities.spec.ts` is an empty placeholder, and **`@playwright/test` is NOT installed** — it must be added as a devDependency for `npx playwright test` + a config file to work.
- **The smoke recipe already exists in working form.** The prose recipe is in `REFACTOR_HANDOFF.md` (lines ~87–100), and ten working Playwright scripts in `.fable/` (`fable-verify-*.mjs`, `fable-gate-d-*.mjs`) already implement it end-to-end: seed `localStorage` (`driftUser`, `drift_onboarded='true'`, plus full chat fixtures), mock Gemini SSE via `page.route('**generativelanguage.googleapis.com/**', …)` branching on `postData()`, viewport ≥1400×950, selectors `div.ai-message[data-message-id]`, `[data-drift-message-id]`, `textarea[placeholder="Explore this drift…"]`. They run as plain `node` scripts against a dev server on port **5199** (deliberately not 5173, to avoid clashing with a user-running instance). Adapt these — don't re-derive.
- Reviewers are scoped to the **git diff under review**, not the whole app.

## Files to create / modify

### 1. New subagents — `.claude/agents/` (format follows existing `mobile-ui-reviewer.md`)

> Note: the existing `mobile-ui-reviewer.md` frontmatter has only `name` + `description` — no `tools`/`model` fields yet. Adding them is an extension of the current format, not a match; verify the running Claude Code version honors both fields.

- **`qa-tester.md`** — persona "Quinn", the QA tester. After a feature/design/logic change: run `npx playwright test` (smoke suite), then use Playwright MCP tools to interactively exercise the flows touched by the diff (click, type, navigate, read accessibility snapshots). Reports each finding with: severity, flow, repro steps, expected vs actual, and **likely source file path(s)** (may Grep for the component). `model: fable` (low effort); tools: Bash, Read, Grep, Glob, Playwright MCP tools.
- **`product-manager.md`** — persona "Morgan", the PM/aggregator. Input: the three raw reports passed in by the orchestrator. Dedupes overlapping findings, groups by theme, prioritizes P0/P1/P2, and outputs one "What needs to be done" **checkbox checklist** where each item carries its file paths, repro, and rough effort — so `/work-the-list` can act without re-investigation. Items requiring a product decision are tagged `needs-decision`. `model: fable` (low effort); read-only tools.
- **`code-reviewer.md`** — reviews the current diff for correctness bugs plus reuse/simplification opportunities. (Note: `/code-review` is a Claude Code **built-in**, not a file in this repo — there is nothing in `.claude/` to copy from. Spell the criteria out in the agent prompt: correctness/edge cases/regressions first; then duplication, dead code, missed reuse of existing hooks/utils, unnecessary complexity.) Findings include `file:line` + severity. `model: fable` (low effort); Read/Grep/Glob + Bash (git diff/log).
- **`mobile-ui-reviewer.md` (broaden in place)** — keep the filename and the existing iOS/Capacitor rules and `[severity] — component — description — fix` output format; add a web/design-system section and require `file:line` in every finding. Add `model: fable`. **Do not hardcode hex values in the prompt** — the agent's current hardcoded palette has already drifted from reality (it says pink `#ff006e`, but `DESIGN_SYSTEM.md` and `tailwind.config.js` both define `#ff007a`; it labels cyan `#06b6d4` as "Connect/Snippets", but Connect/discovery actually uses `accent-discovery: #22d3ee`, while `#06b6d4` cyan is Snippets only). Instead, instruct the agent to read `DESIGN_SYSTEM.md` and `tailwind.config.js` as the source of truth for palette, transition durations, and motion rules, and to flag any UI code that diverges from those files.

### 2. Orchestration skill — `.claude/skills/review-feature/SKILL.md`
Manual `/review-feature`. Steps the top-level session follows:
1. Compute the change under review (working-tree diff, or branch vs main) and the changed-file list.
2. Ensure a dev server is up for the QA pass: reuse a running instance if one is detected, otherwise boot `npm run dev` on a dedicated port (follow the `.fable/` convention of 5199 so a user-running 5173 instance is never disturbed). Pass the resulting URL to the qa-tester. The Playwright `webServer` config covers the scripted suite, but the interactive MCP pass needs this explicit step.
3. Launch **qa-tester**, **mobile-ui-reviewer**, and **code-reviewer** subagents **in parallel**, each given the diff summary + changed file list (and the dev-server URL for QA).
4. Feed the three raw reports to the **product-manager** subagent for synthesis.
5. Write `.claude/reports/<YYYY-MM-DD>-<slug>/{qa,design,code-review,summary}.md`.
6. Echo `summary.md` (the PM action list) in chat as the headline result.

### 3. Downtime skill — `.claude/skills/work-the-list/SKILL.md`
Manual `/work-the-list` (optional arg `<n>` for batch size, default 3):
1. **Start (or confirm) a running dev server first.** `.claude/settings.local.json` has a PostToolUse hook that runs `npm run build && npx cap sync ios` after every Edit/Write *when Vite is not running* — a batch of fixes would otherwise trigger repeated multi-minute builds. Keeping `npm run dev` up makes the hook self-skip; do one `npm run build` at the end of the batch instead.
2. Read the most recent `.claude/reports/*/summary.md`; list open (unchecked) items.
3. Pick the top-priority unchecked items (P0 first); implement each fix directly using the file paths/repro in the report.
4. After each fix: run relevant tests, then check the item off in `summary.md` with a one-line note of what was done.
5. After the batch: run `npm run build` once to verify everything compiles.
6. End with a short chat recap: fixed / skipped / blocked-needs-user.
- Safety rails: never tackle items tagged `needs-decision`; stop and ask if a fix balloons beyond its description; commit per-fix with clear messages.

### 4. Playwright MCP registration
Add to project MCP config (`.mcp.json` at repo root):
```json
{ "mcpServers": { "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] } } }
```
Free/open-source (Microsoft, Apache-2.0). One-time `npx playwright install chromium` for the browser binary (needs network access).

### 5. Playwright scripted wiring
- **`@playwright/test`** (new devDependency): required for the test runner + config; only the bare `playwright` package is installed today.
- **`playwright.config.ts`** (new): baseURL `http://localhost:5199` (the `.fable/` convention — avoids clashing with a user's 5173 dev server), viewport 1400×950, `webServer` booting `vite --port 5199`, screenshot/trace on failure.
- **`e2e/smoke.spec.ts`** (new): **adapt, don't rewrite** — port the proven setup from the `.fable/*.mjs` scripts (localStorage seeding helpers, chat fixtures, the `page.route()` Gemini SSE mock that branches on `postData()`) and the prose recipe in `REFACTOR_HANDOFF.md` (~lines 87–100) into `@playwright/test` form, ideally extracting the shared seed/mock helpers into `e2e/helpers.ts`. Then exercise core flows: send a message → select text and drift → push-to-main → save a snippet; assert on the documented selectors. Replaces the empty `e2e/entities.spec.ts` placeholder.

### 6. Reports folder — `.claude/reports/`
Tracked (add `.gitkeep`). Layout: `.claude/reports/<YYYY-MM-DD>-<slug>/qa.md`, `design.md`, `code-review.md`, `summary.md`. `summary.md` uses GitHub-style checkboxes so `/work-the-list` can mark progress in place.

## Verification
1. Agents load cleanly (frontmatter parses; all four listed at session start).
2. `npx playwright test` runs `e2e/smoke.spec.ts` green against the dev server; the Playwright MCP server connects and can navigate to the dev-server URL (port 5199 by default).
3. End-to-end dry run: make a small UI change → run `/review-feature` → confirm three reports + PM summary land under `.claude/reports/<date>-<slug>/`, summary is echoed in chat, and every finding carries file paths.
4. `/work-the-list` dry run: reads the latest summary, fixes one low-risk item, checks it off in the file, recaps in chat.
5. `npm run lint` and `npm run build` remain green.

## Out of scope (future)
- Auto-trigger hook after edits (manual-only for now; could mirror the iOS auto-build PostToolUse hook, which lives in the untracked `.claude/settings.local.json`, later).
- Posting PM summaries to GitHub PRs.
- iOS-simulator-based QA pass (web covers logic; the existing `ios-preview` skill remains for visual checks).
