# Tailwind-only styling migration

**Date:** 2026-09-15
**Status:** Approved, ready for implementation plan
**Scope:** Replace the hand-written `src/style.css` (1,323 lines) with Tailwind
utilities and a small set of extracted primitives.

## Goal

The React layer currently runs two styling systems in parallel:

- `src/components/ui/*` — shadcn components using Tailwind utilities, `cva`
  variants, and design tokens.
- Everything else — semantic class names (`.desktop-shell`, `.camera-image`,
  `.clip-copy`) resolved by a 1,323-line bespoke stylesheet.

They disagree about the same things. Focus rings are the clearest case: a
`<Button>` uses `focus-visible:ring-ring/30` (`ui/button.tsx:6`) while the raw
layout-switch buttons next to it use a global
`outline: 2px solid #5489cf` (`style.css:170`). Same toolbar row, two
treatments.

Consolidate on Tailwind.

## Decisions

| Decision | Choice |
|---|---|
| Visual parity | Migrate **and** fix known issues in one pass |
| Readability strategy | Extract UI primitives; feature components compose them |
| Test hooks | Convert the 5 class-based selectors to `data-testid` |
| CSS floor | `style.css` keeps tokens, base layer, and Leaflet overrides only |
| Sequencing | Primitives first, then leaf-to-root, one component per commit |

The parity choice produces a large diff where conversion and intentional
changes are hard to distinguish. Mitigation is the commit sequence: each
commit covers one component and is independently reviewable.

## Feasibility

The stylesheet converts more cleanly than its size suggests:

- 0 vendor pseudo-elements
- 0 `:has()` / sibling-combinator rules
- 1 `@keyframes` (`spin`) — replaced by Tailwind's `animate-spin`
- 3 Leaflet overrides — must stay as CSS (third-party DOM)
- 17 attribute selectors, all driving the stage grid

## Colour architecture

The 26 hardcoded colours fall into two groups. Conflating them breaks the
design.

### Group A — the stage palette (20 values, theme-independent)

Every colour inside `.stage` / `.camera` / `.empty-state` is a fixed dark
value that does **not** flip with the theme. `--stage` is `#111317` in light
and `#101113` in dark — effectively identical. This is deliberate: the video
stage stays dark in both themes, like Final Cut or Premiere keeping the viewer
dark regardless of app chrome.

Mapping these onto `--background` / `--muted` would turn the stage white in
light mode. They need their own treatment.

Measured against every Tailwind neutral scale (ΔOKLab, lower is closer):

```
zinc      60.1   ← best fit
neutral   65.3
gray      68.7
stone     74.7
slate     81.3
```

The 20 values collapse onto six `zinc` steps. Notably, all seven near-duplicate
mid-greys (`#868d97`, `#8f939b`, `#979ba4`, `#9ca4b1`, `#a1a6ad`, `#a9adb5`,
`#aab7c8`) independently land on `zinc-400` — strong evidence they were always
meant to be one value and drifted.

Nearest-match is the input to the mapping, not the answer. Three surfaces all
match `zinc-900` most closely, but the camera surface is deliberately darker
than its header bar; collapsing them would flatten that layering. Steps are
therefore assigned by role, using the distance table to choose between adjacent
candidates.

| Role | Current | Utility |
|---|---|---|
| Camera surface | `#101113` | `bg-zinc-950` |
| Camera header, error backdrop | `#1e2024`, `#181a20` | `bg-zinc-900` |
| Stage border, action hover | `#303236`, `#363940` | `bg-zinc-800` / `border-zinc-800` |
| Stage gridline (1px gaps) | `#36383b` | `bg-zinc-700` |
| Empty-state gradient | `#272c34`→`#15171c` | `from-zinc-900 to-zinc-950` |
| Primary text on stage | `#eee`, `#ebedf1` | `text-zinc-100` |
| All 7 mid-greys | `#868d97`…`#aab7c8` | `text-zinc-400` |
| Non-text decoration only | `#777d88` | `text-zinc-500` |
| Camera error text | `#ec9c98` | `text-red-300` |
| Empty-symbol fill/border | `#ffffff08/12` | `bg-white/5` `border-white/10` |

Contrast improves. Every text pair passes WCAG AA for normal text:

```
zinc-100 on zinc-950   18.07   zinc-400 on zinc-950    7.56
zinc-100 on zinc-900   16.11   zinc-400 on zinc-900    6.74
```

One deliberate deviation: the 10px empty-state footnote nearest-matched
`zinc-500`, which lands at **4.12 — a fail** for normal-size text. It moves to
`zinc-400`. `zinc-500` is reserved for non-text decoration.

**This adds zero custom tokens.** `@theme` stays exactly as shadcn generated
it; the stage is expressed entirely in stock utilities.

### Group B — genuine leaks (6 values, must flip with theme)

These map to the existing semantic tokens, not to zinc:

```
#868d97  sidebar folder icon   → text-muted-foreground
#5489cf  focus outline (x2)    → ring-ring   (deletes the global :focus-visible)
#618dc1  input accent-color    → accent-primary
```

## Primitives

Three components earn extraction. Two candidates were rejected:

- **Generic `Panel` — rejected.** `.camera`, `.map-section` and `.graph-panel`
  do not share a header+body shape. The map header is an absolutely-positioned
  floating chip (`position:absolute; z-index:500; pointer-events:none`); the
  graph heading is an inline flex row. One component over all three means three
  variants sharing almost no styling.
- **`StatReadout` — rejected.** `.speed-readout` (baseline-aligned, 25px
  number) and `.recorded-time` (stacked column, left border) share only
  `tabular-nums`. That is a utility, not a component.

### 1. `ToggleGroup` — `src/components/ui/toggle-group.tsx`

Installed via `npx shadcn@latest add toggle-group`, not hand-rolled. Radix-backed,
so roving tabindex and correct `radiogroup`/`radio` semantics come for free.

Replaces `.view-switch` and `.library-filter`. Today those 11 buttons are 11
separate tab stops signalling single-select with `aria-pressed` (the wrong
role). After: one tab stop, arrow-key navigation, correct semantics.

Each item keeps its `data-layout` / `data-filter` attribute — `native-smoke.js`
selects on them.

### 2. `CameraPanel` — `src/components/CameraPanel.tsx`

Three uses: front, cabin, and the rear panel currently hand-inlined in
`App.tsx:210-240`.

```tsx
<CameraPanel title="Front camera" actions={<>…</>} footer={<LensZoom/>}>
  <canvas … />
</CameraPanel>
```

Carries the "camera header" meaning so `bg-zinc-900` does not have to.

### 3. `SidebarRow` — `src/components/SidebarRow.tsx`

`.folder` and `.clip` are the same pattern
(`flex items-center gap-[7px] w-full text-left rounded-md`) with unintentional
drift: `padding: 10px 5px` vs `11px 7px`, `margin-bottom: 3px` vs `2px`.

Only 2 call sites, both in one file — borderline by usage count. It earns its
place by unifying the drift, and by carrying the `data-testid` and
`aria-current` wiring the smoke tests need.

### Placement

```
src/components/ui/      shadcn-managed; the CLI can overwrite this directory
  button  dialog  tooltip  toggle-group(new)
src/components/         app-specific
  CameraPanel(new)  SidebarRow(new)
  CameraView  Transport  TelemetryPanel  LibrarySidebar  RouteMap
```

App primitives stay out of `ui/` so a future `shadcn add` cannot clobber them.

## Stage grid

`native-smoke.js` pins two things, so they survive regardless of approach:

- `$("stage").dataset.layout === mode` (line 217)
- `button[data-layout="…"]` (line 215)

### Derive in React, not in CSS

`layout` is already React state; the attribute selector was only ever a
workaround for CSS not having access to it.

```ts
const STAGE_LAYOUTS = {
  all:      { grid: "grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
              front: "row-span-2", hide: [] },
  split:    { grid: "grid-cols-2 grid-rows-1", front: "", hide: ["rear"] },
  panorama: { grid: "grid-cols-1 grid-rows-1", front: "", hide: ["cabin","rear"] },
  round:    { grid: "grid-cols-1 grid-rows-1", front: "", hide: ["cabin","rear"] },
  front:    { grid: "grid-cols-1 grid-rows-1", front: "", hide: ["cabin","rear"] },
  cabin:    { grid: "grid-cols-1 grid-rows-1", front: "", hide: ["front","rear"] },
  rear:     { grid: "grid-cols-1 grid-rows-1", front: "", hide: ["front","cabin"] },
} satisfies Record<StageLayout, StageArrangement>;
```

`satisfies Record<StageLayout, …>` makes an unhandled layout a compile error.
The current CSS silently falls through to the default grid instead.

### `hide` must render as a class, never as a conditional mount

It is tempting to write `{!hidden && <CameraPanel/>}`. **That is a regression.**
The user's pan, zoom and roll live in the `Lens` instance created by the
`useEffect` at `CameraView.tsx:25`, keyed on `[camera, source]`. Unmounting
destroys the Lens and its WebGL context, so `all` → `cabin` → `all` would
silently reset the front camera's framing and flash on remount.

`display:none` keeps the component mounted and the rAF loop running, matching
current behaviour. `hide` compiles to Tailwind's `hidden`. This must carry a
code comment so it is not "cleaned up" later.

## Removing redundant layouts

`front`, `cabin` and `rear` are removed from the layout switcher. Clicking a
camera (or its expand button) already sets `expanded`, and
`cameraLayout = expanded ?? layout` produces exactly the same stage
arrangement.

`native-smoke.js` already demonstrates the redundancy — two loops asserting the
same value, one per path — and `"front"` is already absent from the switcher
loop.

The type split makes the redundancy impossible to reintroduce:

```ts
export type Layout      = "all" | "split" | "panorama" | "round";  // switcher offers
export type StageLayout = Layout | "front" | "cabin" | "rear";     // stage renders
```

`layout` state stays `Layout`; `cameraLayout` widens to `StageLayout`. All 7
arrangements remain reachable — the three solo views only by clicking a camera.

This also resolves `front`/`panorama`/`round` being three identical layouts.
The duplicate was `front`. `panorama` and `round` remain distinct because they
carry different lens projections, set at `CameraView.tsx:52-60`.

Test change: delete `"cabin"` and `"rear"` from the line-214 list. The
expand loop at line 264 already covers them.

## Test hooks

Of 110 selector calls in `native-smoke.js`, only 5 are class-based and break:
`.desktop-shell`, `.workspace`, `.graph-panel`, `.clip`, `.folder`. They become
`data-testid`. The remaining 105 use `getElementById`, `aria-label`, `role` or
`data-*` and are unaffected.

## What stays in style.css

Target: ~160 lines.

```
@import tailwindcss / tw-animate-css / shadcn
@theme inline { --color-* }          ← this IS the Tailwind config in v4
:root  { --selection, --chrome }     ← theme-dependent tokens
.dark  { … }
@layer base { html, body, button, -webkit-app-region }
.leaflet-*                           ← 3 third-party overrides
```

No `.camera`, `.stage`, `.clip`, `.titlebar`.

## Verification

No React component-test stack is added; that is scope creep on an already
large change. The nets are:

1. `npx tsc --noEmit` — currently clean, must stay clean
2. `npx eslint src` — currently clean
3. `node --test tests/*.test.ts` — pure logic, untouched
4. `tests/native-smoke.js` — run explicitly against the built app after each
   component lands; it is **not** part of `npm test`

The smoke suite asserts behaviour, not appearance. Combined with the
migrate-and-fix choice, some pixel drift will land that no test catches. A
manual pass over both themes is required before the final commit.

## Commit sequence

Each commit builds, lints and passes smoke independently.

| # | Commit | Removes from style.css |
|---|---|---|
| 1 | Fix deps: add `cn`, drop `clsx` / `tailwind-merge` | — |
| 2 | `toggle-group`; convert both switchers; drop 3 layouts; split `Layout` | ~60 |
| 3 | `CameraPanel` + `STAGE_LAYOUTS`; zinc palette | ~240 |
| 4 | `Transport` → utilities | ~180 |
| 5 | `TelemetryPanel` + `RouteMap` → utilities | ~190 |
| 6 | `SidebarRow` + `LibrarySidebar` | ~210 |
| 7 | Shell: titlebar, workspace, review, empty-state, dialog | ~280 |
| 8 | Delete global `:focus-visible`; map Group B to semantic tokens; prune | remainder |

Commit 1 is independent of the migration and fixes two latent build breaks of
the same class — production code importing from packages that are not
production dependencies.

**1. `cn` is undeclared.** `src/lib/utils.ts` is `export { cn } from "cn"`, but
`cn` appears in neither `dependencies` nor `devDependencies`. It resolves today
only as a transitive dep of the `shadcn` CLI (`bun.lock:472`, pulled in by
`shadcn@4.21.0`). Meanwhile `clsx` and `tailwind-merge` are declared and have
zero imports — `cn` replaced them and the old deps were never removed.

**2. `shadcn` is a devDependency supplying production CSS.**
`src/style.css:3` is `@import "shadcn/tailwind.css"` — 629 lines defining the
`data-open`, `data-closed`, `data-checked`, `data-active` custom variants plus
the `scroll-fade` / `shimmer` utilities. `ui/dialog.tsx` and `ui/tooltip.tsx`
use six of those variants:

```
data-open:animate-in    data-closed:animate-out
data-open:fade-in-0     data-closed:fade-out-0
data-open:zoom-in-95    data-closed:zoom-out-95
```

This fails **silently**. An unknown variant generates no rule and raises no
error, so a production install (`--omit=dev`) would build cleanly and simply
lose every dialog and tooltip animation.

Fix for both: move `shadcn` to `dependencies` (or vendor `tailwind.css` into
the repo) and declare `cn` explicitly.

| Change | Action |
|---|---|
| `cn` | add to `dependencies` |
| `shadcn` | move `devDependencies` → `dependencies` |
| `clsx` | remove (0 imports) |
| `tailwind-merge` | remove (0 imports) |
