# Drift — Design System

> Drift should feel like the smartest app someone has ever used for thinking.
> Dark, luminous — **ideas have light inside them.** You *drift*: a thought leads
> to a term, a term opens a world. The interface is a calm void where those ideas
> glow.

This is the canonical visual spec. The tokens below already exist in
`tailwind.config.js` and `src/index.css` — **consume them, never redefine them.**
Components should reach for these named tokens before inventing local values.

---

## 1. Principles

1. **Light from within.** Surfaces are dark and quiet; meaning is conveyed by
   *emission*, not by borders or fills. Important things glow.
2. **Depth, not flatness.** Layers recede with blur and dimming; the foreground
   is sharp and bright. The eye always knows where "now" is.
3. **Motion is breath.** Nothing snaps. Things ease in with spring, settle, and
   idle with a slow breathing pulse. Motion implies a living system.
4. **Restraint.** One accent family (violet→cyan). Generous negative space. Type
   is small, confident, and legible. We never decorate for decoration's sake.
5. **Touch-first.** Every affordance works without hover. Targets ≥ 26px on
   mobile. Nothing is gated behind a pointer.

---

## 2. Palette

### Foundation (CSS custom properties — `src/index.css`)
RGB triplets so Tailwind's `/<alpha>` modifier works (`bg-dark-surface/60`).

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-bg` | `10 10 10` | `250 250 250` | App base void |
| `--color-surface` | `17 17 17` | `255 255 255` | Panels, sheets |
| `--color-elevated` | `26 26 26` | `242 242 247` | Cards, inputs |
| `--color-border` | `51 51 51` | `220 220 225` | Hairlines |
| `--color-text-primary` | `255 255 255` | `17 17 17` | Headlines, body |
| `--color-text-secondary` | `156 163 175` | `50 50 60` | Supporting text |
| `--color-text-muted` | `107 114 128` | `130 130 140` | Meta, timestamps |

Consume via Tailwind: `bg-dark-surface`, `text-text-muted`, `border-dark-border`,
or `rgb(var(--color-surface))` inline. Both themes are driven by the `.dark` class.

### Accent ramp (`tailwind.config.js` → `colors.accent`)
The brand is a **descent into deeper water**: violet at the surface, cyan in the
depths. Drift = the act of going deeper, so deeper structures cool toward cyan.

| Token | Hex | Meaning |
|---|---|---|
| `accent-pink` | `#ff007a` | Signature spark — selection, the Drift CTA |
| `accent-violet` | `#a855f7` | Primary brand — surface ideas, origin |
| `accent-pink-{300,400,500,600}` | ramp | Pink shades (hover/active states) |
| `accent-violet-{300,400,500,600}` | ramp | Violet shades (depth, emphasis) |
| `accent-discovery` | `#22d3ee` (cyan) | Discovery / deepest exploration |

**Luminosity gradient by depth** (used by the Knowledge Tree, reusable anywhere a
hierarchy needs color): violet `#c084fc` → indigo `#6366f1` → sky `#38bdf8` →
discovery cyan `#22d3ee`. Each step has a bright **core**, a softer **halo**, and
a saturated **rim**.

`::selection` is `accent-pink/30` — the spark of choosing text to drift on.

---

## 3. Type scale

Font: **Inter** (300–700), `font-sans`. `-webkit-font-smoothing: antialiased`.

| Token | Approx | Use |
|---|---|---|
| `text-micro` | ~9px | Labels, uppercase eyebrows (`tracking-widest`) |
| `text-tiny` | ~10px | Pills, counts, timestamps |
| `text-meta` | ~11px | Previews, secondary captions |
| `text-body` | ~13–14px | Card titles, body |
| `text-title` | ~15px+ | Panel headlines |

Conventions:
- **Eyebrows**: `text-micro font-bold uppercase tracking-widest`, accent-colored.
- **Titles**: `font-semibold leading-snug`, clamp to 1–2 lines with `-webkit-line-clamp`.
- Inputs must stay ≥16px (`src/index.css` forces this to prevent iOS zoom).

---

## 4. Elevation & glow

Elevation is **light**, not just shadow. Three jobs:

1. **Lift** — a soft dark shadow grounds a card above the void.
2. **Glow** — a colored bloom signals energy/selection. Use the glow shadow tokens:
   `shadow-glow-sm` / `shadow-glow-md` / `shadow-glow-lg`,
   plus tinted `shadow-glow-pink` and `shadow-glow-discovery`.
3. **Inner light** — important orbs/CTAs carry an inset/inner highlight so they
   read as *emitting* rather than reflecting.

Surfaces layer as: void (`--color-bg`) → panel (`--color-surface`) →
card (`--color-elevated`) → glass (translucent + `backdrop-filter: blur`).
Glass panels over the void use `backdrop-filter: blur(12–16px) saturate(1.2)`
and a hairline border of the local accent at ~40% alpha.

**Glow recipe** for a luminous node/CTA:
```
fill: radial-gradient(circle at 38% 34%, #fff, <core> 30%, <rim> 80%);
box-shadow: 0 0 40px <halo>73, inset 0 0 14px rgba(255,255,255,0.4);
```
Borders carry color, never weight: `1px` hairlines tinted with the accent.

Radii: `rounded-xl` (12px) for buttons/chips, `rounded-2xl` (16px) for cards,
`18px` for sheets. Nothing sharp.

---

## 5. Motion language

Easing (Tailwind `transitionTimingFunction`, never hand-roll these):

| Token | Curve | Use |
|---|---|---|
| `ease-spring` | `cubic-bezier(0.34,1.46,0.64,1)` | Entrances, taps — slight overshoot, alive |
| `ease-out-expo` | `cubic-bezier(0.16,1,0.3,1)` | Reveals, settling into place |
| `ease-in-out-soft` | — | Idle loops, gentle state changes |

Named animations (consume, don't recreate):
`animate-breathe` (slow scale/opacity idle pulse), `animate-reveal-up`
(staggered entrance), `animate-bloom` (glow expand), `.drift-text-shimmer`
(streaming text sheen).

Timing rules:
- **Taps**: `active:scale-[0.98]` (cards) / `active:scale-90` (icon buttons).
- **Entrances**: 0.3–0.6s `ease-out-expo`/`ease-spring`, stagger siblings ~50ms.
- **Idle life**: 3–5s breathing loops only; nothing fast or attention-grabbing.
- **Flow**: along connectors/rivers, a slow dash offset suggests current.

**Reduced motion is law.** A global
`@media (prefers-reduced-motion: reduce)` floor already neutralizes CSS loops.
Any JS-driven looping animation must additionally gate on
`window.matchMedia('(prefers-reduced-motion: reduce)').matches`.

---

## 6. The Knowledge Tree (reference implementation)

`src/components/DriftKnowledgeGraph.tsx` is the purest expression of the identity:
a "map of a mind in motion." It demonstrates the full system —

- **Bioluminescent nodes**: each is an SVG `radialGradient` orb (white core →
  accent core → halo → rim) with a `feGaussianBlur` glow filter and a blurred
  white specular highlight, so light appears to come from *inside*.
- **Rivers, not lines**: connectors are horizontal-flowing cubic béziers with a
  base stroke plus an animated `stroke-dasharray` pulse of light traveling
  parent→child.
- **Depth-of-field**: depth ≥ 2 unselected nodes get a haze blur and dimming;
  the focused node is sharp, ringed by an expanding breathing aura.
- **Living ambience**: a radial violet→cyan backdrop and slow drifting motes
  (reduced-motion gated).
- **Color = depth**: violet surface → cyan depths via the luminosity gradient.

It's pan/pinch/zoom, fits-to-screen on open, and renders in both a mobile bottom
sheet and a desktop side panel. Use it as the north-star reference for any new
luminous, spatial surface in Drift.
