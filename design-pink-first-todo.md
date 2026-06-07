# Drift — "Pink-First" Design Overhaul

## What this is
Apply the palette from `design-preview.html` to the actual app.
Designer's suggestion: systematic dark scale as bg, grey scale as fg/text, **pink as primary accent/CTA** (currently violet dominates).

## Preview reference
`/Users/morhogeg/Drift/design-preview.html` — open in browser to see the target look.

## Palette changes

### CSS vars (`src/index.css` — dark theme block)
No bg changes needed (already `#0a0a0a / #111 / #1a1a1a / #333`).
Refine text scale:
```css
--color-text-secondary: 176 176 176;   /* was 156 163 175 — neutral grey */
--color-text-muted:     136 136 136;   /* was 107 114 128 — lighter muted */
```

### Accent hierarchy flip
| Role | Currently | Target |
|---|---|---|
| Primary CTA / interactive | `accent-violet` (#a855f7) | `accent-pink` (#ff007a) |
| Secondary / depth | `accent-pink` | `accent-violet` |
| Focus rings | `ring-accent-violet` | `ring-accent-pink` |
| Active bg tints | `bg-accent-violet/10` | `bg-accent-pink/[0.08]` |
| Active borders | `border-accent-violet/40` | `border-accent-pink/30` |

---

## Files to change

### 1. `src/index.css`
- Update `--color-text-secondary` and `--color-text-muted` (see above)
- Change `::selection` color — already `accent-pink/30`, keep as-is
- Prose blockquote border: `border-l-accent-violet` → `border-l-accent-pink` (in multiple prose class strings)
- Synthesis card: keep violet (it's a "depth" surface, fine)
- `drift-suggestion` underline: already pink, keep
- `drift-push-glow`: already pink, keep

### 2. `src/App.tsx` — high-impact spots
- **Sidebar active chat row** (line ~2753): `bg-accent-violet/[0.07]` + `border-accent-violet/25` → pink equivalents
- **Sidebar active chat row** (line ~2771): `text-accent-violet bg-accent-violet/[0.12] border border-accent-violet/40` → pink
- **Knowledge graph button** (line ~2789): `text-accent-violet` → pink
- **New chat button** (line ~2489): gradient border → lead with pink
- **Model selector breadcrumb row** (line ~2753–2755): violet → pink
- **Focus border on search input** (line ~2455): `focus:border-accent-violet/50` → pink
- **User avatar circle** (line ~2552): `bg-accent-violet/30 text-accent-violet` → pink
- **Drift tag badge on pushed messages** (line ~3170–3171): `bg-accent-violet/[0.08] border-accent-violet/20 text-accent-violet/80` → pink
- **Drift strand border** (line ~3142): `border-accent-violet/30` → pink
- **Coach mark / empty state** (line ~2932–2935): `border-accent-violet/20 bg-accent-violet/[0.05]` + `text-accent-violet font-medium` → pink
- **Prose links & code** (lines ~3447–3450, 3552–3555): `prose-a:text-accent-violet`, `prose-code:text-accent-violet`, `prose-blockquote:border-l-accent-violet` → pink
- **Inline drift link** (line ~3490–3491): already pink ✓
- **Send button** (line ~3204): already `from-accent-pink to-accent-violet` ✓ (keep, just maybe adjust shadow)
- **Scroll-to-bottom / scroll buttons** (line ~2840–2841): hover gradients → pink-lead

### 3. `src/components/SidebarChatRow.tsx`
- Line 62: `bg-accent-violet/[0.10]` → `bg-accent-pink/[0.08]`
- Line 64: gradient `from-accent-pink/[0.10] to-accent-violet/[0.10]` → `from-accent-pink/[0.12] to-accent-pink/[0.05]`
- Line 87: `bg-gradient-to-b from-accent-violet/40 via-accent-violet/20` → pink
- Line 99: `bg-accent-violet/80` (active dot) → `bg-accent-pink`
- Line 135: `focus:ring-accent-violet` → `focus:ring-accent-pink`
- Line 150: `text-accent-violet/90` (drift term text) → keep violet (it's a depth/drift label, fine)
- Line 170: `text-accent-violet/50` ("from" label) → `text-text-muted`

### 4. `src/components/DriftPanel.tsx`
- Line 1152: `border-l border-accent-violet/[0.12]` → `border-accent-pink/[0.10]`
- Line 1163: glow blob `bg-accent-violet/[0.10]` → `bg-accent-pink/[0.08]`
- Line 1322: active template tab `bg-accent-violet/20 text-accent-violet border-accent-violet/40` → pink
- Line 1333: tip bar `border-b border-accent-violet/15 bg-accent-violet/[0.06]` → pink
- Line 1334–1335: sparkles icon + text highlights `text-accent-violet/70` / `text-accent-violet/90` → pink
- Line 1351, 1382: nav arrows `hover:text-accent-violet hover:bg-accent-violet/[0.1]` → pink
- Line 1370: active history tab `bg-accent-violet/[0.18] text-accent-violet border-accent-violet/40` → pink
- Line 1525: input `focus:border-accent-violet/30 focus:shadow-[...rgba(168,85,247...]` → pink shadow
- Line 1642: user bubble `bg-accent-violet/15 border-accent-violet/25` → pink
- Line 1719: copy btn hover `hover:text-accent-violet hover:bg-accent-violet/[0.08]` → pink
- Line 1762–1763: template btn borders `border-accent-violet/20 bg-accent-violet/[0.04] hover:border-accent-violet/40` → pink
- Line 1797: input focus `focus:border-accent-violet/30` → pink
- Line 1844: send btn gradient already `from-accent-pink to-accent-violet` ✓ — adjust shadow to `shadow-accent-pink/20`

### 5. `src/components/ModelPickerSheet.tsx`
- Line 65: selected row `bg-accent-violet/10 border-accent-violet/40` → pink
- Line 80: checkmark circle `bg-accent-violet` → `bg-accent-pink`
- Line 124: confirm button `bg-accent-violet` → `bg-accent-pink`

### 6. `src/components/ModelPillRow.tsx`
- Line 28: active pill `bg-accent-violet/15 border-accent-violet/30` → pink

### 7. `src/components/Settings.tsx`
- Toggle: `bg-accent-violet` (checked) → `bg-accent-pink`
- Focus rings: `focus:ring-accent-violet/50` → `focus:ring-accent-pink/50`
- Hover borders: `hover:border-accent-violet/40` → pink
- Save button gradient (line 662): keep `from-accent-violet to-accent-pink` or flip to `from-accent-pink to-accent-violet`

### 8. `src/components/SearchModal.tsx`
- Active result row `bg-accent-violet/[0.12]` → `bg-accent-pink/[0.08]`
- Drift icon `text-accent-violet/70` → fine to keep (drift = violet is still valid as depth color)
- Highlight mark `bg-accent-violet/25` → `bg-accent-pink/25`

### 9. `src/components/MultiModelCarousel.tsx`
- Line 110: pill border `border-accent-violet/40 text-accent-violet` → pink
- Line 130: active indicator `bg-accent-violet` → `bg-accent-pink`

### 10. `src/components/AddModelSheet.tsx`
- Hover borders `hover:border-accent-violet/40` → pink
- Dashed add button `border-accent-violet/40 bg-accent-violet/[0.07]` + icon → pink
- Selected state `bg-accent-violet/10 border-accent-violet/40` → pink
- Checkbox `bg-accent-violet` → `bg-accent-pink`

---

## What to keep violet
- Knowledge tree / DriftKnowledgeGraph (depth visualization — violet is intentional)
- Drift conversation's "source" labels in sidebar (shows hierarchy/origin)
- `synthesis-card` border/glow (depth artifact)
- `drift-promoted-arrive` glow animation (settle-in effect, keep subtle violet)
- Prose `blockquote` border — could go either way, pink is fine too

---

## Quickest approach when resuming
1. Start with `src/index.css` (text scale tweak — 2 lines)
2. Do a targeted find-replace pass: `accent-violet` → `accent-pink` in the **CTA/interactive contexts** listed above (NOT in drift-depth/hierarchy contexts)
3. Adjust specific opacity values (violet/10 → pink/[0.08] since pink is more saturated)
4. Test visually with `npm run dev`
