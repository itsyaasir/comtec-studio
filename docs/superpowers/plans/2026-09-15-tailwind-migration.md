# Tailwind-Only Styling Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1,323-line hand-written `src/style.css` with Tailwind utilities and three extracted primitives, leaving only tokens, a base layer, and Leaflet overrides (~160 lines).

**Architecture:** Feature components compose a small set of primitives (`ToggleGroup`, `CameraPanel`, `SidebarRow`) that own their utilities via `cva`. The stage grid moves from CSS attribute selectors into a typed `STAGE_LAYOUTS` record in React. The permanently-dark video stage maps onto stock Tailwind `zinc`; theme-flipping chrome keeps the existing shadcn semantic tokens.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4.3, shadcn 4.21, `cva`, Radix (`radix-ui` unified package), Vite 8, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-09-15-tailwind-migration-design.md`

## Global Constraints

- **Selectors are scattered — always grep before converting.** 19 selectors are defined in 2–4 separate places with later blocks overriding earlier ones: `.stage` @ 512/633/643/653, `.transport` @ 950/1226, `.titlebar` @ 183/1174, `.transport-buttons` @ 979/1273, `.map-section > header` @ 805/1190, `.audio` @ 1007/1269, `.folder` @ 336/380, `.clip` @ 368/379, `.camera canvas` @ 582/591/595, and others. Before converting any component run `grep -n '<selector>' src/style.css` and read **every** hit. Converting only the first block silently drops overrides.
- **`hide` must render as a CSS class, never a conditional mount.** Pan/zoom/roll live in the `Lens` instance created by the `useEffect` at `CameraView.tsx:25`. Unmounting destroys its WebGL context and resets framing.
- **Zero new custom colour tokens.** `@theme` stays as shadcn generated it. The stage uses stock `zinc`; theme-flipping chrome uses existing semantic tokens.
- **`data-layout` stays on the stage element and on each switcher item** — `native-smoke.js:215,217` selects on both.
- **`id` attributes must not be removed.** 21 `getElementById` calls in `native-smoke.js` depend on them.
- **Root font-size stays 13px**, and `--spacing: 1px` (set in `@theme`) makes the spacing scale pixel-denominated: `h-49` *is* 49px, `mx-16` *is* 16px. Write existing px measurements as plain scale utilities, not arbitrary syntax. Arbitrary values remain correct for properties that do not derive from `--spacing` — `text-[11px]`, `rounded-[7px]`, `shadow-[...]`. Superseded the earlier rule requiring `h-[49px]`: with the default 0.25rem unit against a 13px root, every utility rendered at 0.8125x nominal, so `p-4` was 13px. The five shadcn primitives were rescaled by 3.25x when this landed, preserving their rendered sizes; regenerating one via `shadcn add` will reintroduce the old scale and must be rescaled again.
- **`text-*` utilities are rem-based and are NOT affected by `--spacing: 1px`.** Against the 13px root, `text-xs` is 9.75px (not 12), `text-sm` is 11.375px (not 14), `text-base` is 13px. Write font sizes as arbitrary px (`text-[12px]`) whenever the CSS being replaced states a px value. The same applies to `leading-*`, `rounded-*` and `ring-*`, which also derive from rem or their own scales.
- Verification gate for every task: `npx tsc --noEmit` clean, `npx eslint src` clean, `node --test tests/*.test.ts` passing.

## Why there are no unit tests in these tasks

This is a styling refactor. There is no meaningful failing-test-first cycle for "convert `background: #1e2024` to `bg-zinc-900`" — no assertion distinguishes them that isn't a screenshot. Adding a React testing stack is explicitly out of scope per the spec.

Each task's gate is instead: typecheck, lint, logic tests, and `tests/native-smoke.js` against the built app. Tasks 2, 3 and 8 additionally change *behaviour* or *types*, and those changes do get assertions — see their steps.

The smoke suite asserts behaviour, not appearance. A manual two-theme pass is a required step in Task 8.

## File Structure

**Created:**
- `src/components/ui/toggle-group.tsx` — shadcn-generated; Radix single-select toggle group
- `src/components/CameraPanel.tsx` — camera chrome (header, actions, body, optional footer)
- `src/components/SidebarRow.tsx` — shared `.folder` / `.clip` row
- `src/lib/stage-layouts.ts` — `STAGE_LAYOUTS` record and `StageLayout` type

**Modified:** `package.json`, `src/lib/types.ts`, `src/App.tsx`, `src/components/CameraView.tsx`, `src/components/Transport.tsx`, `src/components/TelemetryPanel.tsx`, `src/components/RouteMap.tsx`, `src/components/LibrarySidebar.tsx`, `src/components/AppErrorBoundary.tsx`, `src/style.css`, `tests/native-smoke.js`

---

### Task 1: Fix dependency declarations

Independent of the migration. Fixes two latent build breaks where production code imports from packages that are not production dependencies.

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `cn` and `shadcn` as declared runtime dependencies. All later tasks rely on `cn` from `@/lib/utils` and on the `data-open:` / `data-closed:` variants from `shadcn/tailwind.css`.

- [x] **Step 1: Confirm both problems are real**

```bash
node -e 'const p=require("./package.json");
console.log("cn in deps:", !!p.dependencies.cn, "| in devDeps:", !!p.devDependencies.cn);
console.log("shadcn in deps:", !!p.dependencies.shadcn, "| in devDeps:", !!p.devDependencies.shadcn);'
grep -n "from \"cn\"" src/lib/utils.ts
grep -n "shadcn/tailwind.css" src/style.css
grep -rn "clsx\|tailwind-merge" src/ || echo "clsx + tailwind-merge: ZERO imports"
```

Expected: `cn` false/false, `shadcn` false/true, both imports present, zero `clsx` imports.

- [x] **Step 2: Confirm the silent-failure surface**

```bash
grep -ohE 'data-(open|closed):[a-z0-9-]+' src/components/ui/*.tsx | sort -u
```

Expected six variants (`data-open:animate-in`, `data-closed:animate-out`, `data-open:fade-in-0`, `data-closed:fade-out-0`, `data-open:zoom-in-95`, `data-closed:zoom-out-95`). These are defined only in `shadcn/dist/tailwind.css`. An undefined variant generates no rule and raises no error, so a `--omit=dev` install builds cleanly and loses every dialog/tooltip animation.

- [x] **Step 3: Apply the dependency changes**

In `package.json`: add `"cn": "^0.2.6"` to `dependencies`; move `"shadcn": "^4.21.0"` from `devDependencies` to `dependencies`; delete `"clsx"` and `"tailwind-merge"` from `dependencies`.

- [x] **Step 4: Reinstall and verify**

```bash
bun install
npx tsc --noEmit && npx eslint src && node --test tests/*.test.ts
```

Expected: install succeeds, all three clean.

- [x] **Step 5: Verify the production install no longer breaks**

```bash
rm -rf /tmp/prodcheck && mkdir -p /tmp/prodcheck
cp package.json bun.lock /tmp/prodcheck/
cd /tmp/prodcheck && bun install --production --ignore-scripts 2>&1 | tail -3
ls node_modules/cn node_modules/shadcn >/dev/null && echo "BOTH RESOLVE IN PROD"
```

Expected: `BOTH RESOLVE IN PROD`.

- [x] **Step 6: Commit**

```bash
git add package.json bun.lock
git commit -m "Declare cn and shadcn as runtime dependencies

src/lib/utils.ts imports cn, which was declared nowhere and resolved only as
a transitive dep of the shadcn CLI. src/style.css imports 629 lines of
production CSS from shadcn, which was devDependencies-only; the data-open and
data-closed variants used by dialog.tsx and tooltip.tsx generate no rule when
absent, so a production install built cleanly and silently lost every dialog
and tooltip animation.

Removes clsx and tailwind-merge, which cn replaced and which have zero imports.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: ToggleGroup, layout-type split, drop redundant layouts

**Files:**
- Create: `src/components/ui/toggle-group.tsx` (via CLI)
- Modify: `src/lib/types.ts` (the `Layout` type), `src/App.tsx:36-44` (`layouts` array) and `:186-200` (`.view-switch`), `src/components/LibrarySidebar.tsx:66-84` (`.library-filter`), `src/components/CameraView.tsx:11` (prop type), `src/style.css` (remove lines 285-301, 492-511)
- Modify: `tests/native-smoke.js:214`

**Interfaces:**
- Consumes: `cn` from Task 1
- Produces:
  - `type Layout = "all" | "split" | "panorama" | "round"` (switcher offers)
  - `type StageLayout = Layout | "front" | "cabin" | "rear"` (stage renders)
  - `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`

- [x] **Step 1: Install the shadcn toggle-group**

```bash
npx shadcn@latest add toggle-group
```

Expected: creates `src/components/ui/toggle-group.tsx` (and `toggle.tsx`). Do not hand-roll — the Radix implementation supplies roving tabindex and `radiogroup`/`radio` semantics, which is the accessibility fix.

- [x] **Step 2: Split the Layout type**

In `src/lib/types.ts`, replace the single `Layout` union with:

```ts
/** What the layout switcher offers. */
export type Layout = "all" | "split" | "panorama" | "round";

/**
 * What the stage can actually render. The three solo views are reachable only
 * by clicking a camera (App sets `expanded`), never from the switcher — the
 * switcher entries for them were redundant with click-to-expand.
 */
export type StageLayout = Layout | "front" | "cabin" | "rear";
```

- [x] **Step 3: Verify the compiler finds every affected site**

```bash
npx tsc --noEmit
```

Expected: FAIL. Errors at `src/App.tsx` (the `layouts` array still lists 7 values; `cameraLayout` is `Layout` but assigned `expanded ?? layout`) and `src/components/CameraView.tsx` (prop typed `Layout`, receives `StageLayout`). This failure is the point — it enumerates the work.

- [x] **Step 4: Narrow the switcher, widen the stage**

In `src/App.tsx`, reduce the `layouts` array to four entries:

```tsx
const layouts: { value: Layout; label: string }[] = [
  { value: "all", label: "All views" },
  { value: "split", label: "Split" },
  { value: "panorama", label: "Panorama" },
  { value: "round", label: "Round" },
];
```

Annotate `cameraLayout` as `StageLayout`:

```tsx
const cameraLayout: StageLayout = expanded ?? layout;
```

In `src/components/CameraView.tsx`, change the `layout` prop type from `Layout` to `StageLayout`. Update the import on both files.

- [x] **Step 5: Replace `.view-switch` with ToggleGroup**

In `src/App.tsx`, replace the `<div className="view-switch">` block (currently lines 186-200) with:

```tsx
<ToggleGroup
  type="single"
  value={cameraLayout}
  onValueChange={(v) => { if (v) { setExpanded(null); setLayout(v as Layout); } }}
  aria-label="Camera layout"
  className="rounded-lg bg-muted p-0.5"
>
  {layouts.map((view) => (
    <ToggleGroupItem
      key={view.value}
      value={view.value}
      data-layout={view.value}
      className="h-6 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground
                 data-[state=on]:bg-background data-[state=on]:text-foreground
                 data-[state=on]:shadow-[0_1px_3px_var(--color-black)]/10"
    >
      {view.label}
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```

`data-layout` is kept deliberately — `native-smoke.js:215` selects on it.

Note `onValueChange` fires with `""` when Radix deselects; the `if (v)` guard prevents clearing the layout.

- [x] **Step 6: Replace `.library-filter` with ToggleGroup**

In `src/components/LibrarySidebar.tsx`, replace the `<div className="library-filter">` block (lines 66-84) with:

```tsx
<ToggleGroup
  type="single"
  value={l.filter}
  onValueChange={(v) => { if (v) l.setFilter(v); }}
  aria-label="Recording type"
  className="grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5"
>
  {([["all","All clips"],["A","Driving"],["P","Parking"],["events","Events"]] as const)
    .map(([value, label]) => (
      <ToggleGroupItem
        key={value}
        value={value}
        data-filter={value}
        className="h-6 rounded-md text-[10px] font-medium text-muted-foreground
                   data-[state=on]:bg-background data-[state=on]:text-foreground"
      >
        {label}
      </ToggleGroupItem>
    ))}
</ToggleGroup>
```

- [x] **Step 7: Delete the superseded CSS**

Remove `src/style.css` lines 285-301 (`.library-filter` and its two child rules) and lines 492-511 (`.view-switch` and its two child rules). Re-grep first per the global constraint:

```bash
grep -n '\.view-switch\|\.library-filter' src/style.css
```

Expected after deletion: only the `.view-switch { order: 3 }` hit inside the 1180px media query at line ~1086 remains. Change that one to target the ToggleGroup by adding `order-3` to its `className` and delete the media-query rule.

- [x] **Step 8: Update the smoke test**

In `tests/native-smoke.js:214`, change:

```js
for (const mode of ["split", "panorama", "round", "cabin", "rear", "all"]) {
```

to:

```js
for (const mode of ["split", "panorama", "round", "all"]) {
```

`cabin` and `rear` are already covered by the click-to-expand loop at line 264, which asserts the identical `$("stage").dataset.layout === camera`.

- [x] **Step 9: Verify** (partial — see note)

```bash
npx tsc --noEmit && npx eslint src && node --test tests/*.test.ts
```

Expected: all clean. Then build and run `tests/native-smoke.js` against the app; the four switcher assertions and the three expand assertions must pass.

**Status:** `tsc --noEmit`, `eslint src`, `node --test tests/*.test.ts` (8/8) and `bun run build` all pass. The built CSS was inspected to confirm every arbitrary utility was emitted (`order:3` inside the 1180px query, `0 1px 3px`, `grid-template-columns`, `var(--selection)`). **`native-smoke.js` was NOT run** — it executes inside the Tauri debug app via `webview.eval` against a real recordings folder and is documented as opt-in and interactive. It must be run before this branch merges.

- [ ] **Step 10: Manually verify the accessibility fix** (NOT DONE — needs a human)

Focus the layout switcher and press Left/Right arrows. Expected: selection moves between items and the stage follows. Tab must move *past* the whole group in one press, not through four stops.

**Status:** not performed — no browser automation is available in this environment (the Playwright MCP server failed to connect) and the app runs under Tauri. Structural precondition verified instead: `@radix-ui/react-toggle-group` emits `role="radiogroup"`/`role="radio"`/`aria-checked` and wires `RovingFocusGroup`. The behaviour itself still needs a human pass.

- [x] **Step 11: Commit**

```bash
git add src/ tests/native-smoke.js package.json
git commit -m "Replace ad-hoc toggle rows with Radix ToggleGroup

The layout switcher and library filter were raw button rows signalling
single-select with aria-pressed, which is the toggle-button role, not
one-of-a-set. Eleven buttons meant eleven tab stops and no arrow-key
navigation. The Radix toggle group supplies radiogroup semantics and roving
tabindex.

Drops front, cabin and rear from the layout switcher: clicking a camera
already sets expanded, and cameraLayout = expanded ?? layout produces the
identical stage arrangement. native-smoke.js already asserted the same value
from both paths. Splitting Layout from StageLayout makes the redundancy a
compile error rather than a convention.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CameraPanel, STAGE_LAYOUTS, and the zinc palette

The largest task. Converts the whole stage region.

**Files:**
- Create: `src/lib/stage-layouts.ts`, `src/components/CameraPanel.tsx`
- Modify: `src/components/CameraView.tsx`, `src/App.tsx` (stage block and inlined rear panel), `src/style.css` (remove 512-702, and the `.camera-focused` rules at 1295-1323)
- Modify: `tests/native-smoke.js:277` (`.desktop-shell` selector)

**Interfaces:**
- Consumes: `StageLayout` (Task 2)
- Produces:
  - `STAGE_LAYOUTS: Record<StageLayout, StageArrangement>` from `@/lib/stage-layouts`
  - `interface StageArrangement { grid: string; front: string; hide: readonly CameraId[] }`
  - `type CameraId = "front" | "cabin" | "rear"`
  - `<CameraPanel title actions? footer? hidden? className? children>` from `@/components/CameraPanel`

- [x] **Step 1: Read every scattered stage rule**

```bash
grep -n '\.stage\|\.camera\b\|\.camera-\|\.camera-focused\|\.empty-state\|\.empty-symbol\|\.lens-controls' src/style.css
```

`.stage` has four definitions (512, 633, 643, 653), `.camera canvas` three (582, 591, 595), `.camera-actions button` two (560, 565). Read all of them before writing any utility.

- [x] **Step 2: Create the typed layout record**

Create `src/lib/stage-layouts.ts`:

```ts
import type { StageLayout } from "@/lib/types";

export type CameraId = "front" | "cabin" | "rear";

export interface StageArrangement {
  /** Grid template utilities applied to the stage element. */
  grid: string;
  /** Extra utilities for the front panel (it spans two rows in "all"). */
  front: string;
  /**
   * Cameras hidden in this arrangement.
   *
   * These MUST render as Tailwind's `hidden` (display:none), never as a
   * conditional mount. Pan, zoom and roll live in the Lens instance created by
   * the useEffect in CameraView; unmounting destroys its WebGL context, so
   * all -> cabin -> all would silently reset the front camera's framing.
   */
  hide: readonly CameraId[];
}

const SOLO = "grid-cols-1 grid-rows-1";

export const STAGE_LAYOUTS = {
  all: {
    grid: "grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
    front: "row-span-2",
    hide: [],
  },
  split: { grid: "grid-cols-2 grid-rows-1", front: "", hide: ["rear"] },
  // panorama and round are front-solo; they differ only in lens projection,
  // set in CameraView from the layout value.
  panorama: { grid: SOLO, front: "", hide: ["cabin", "rear"] },
  round: { grid: SOLO, front: "", hide: ["cabin", "rear"] },
  front: { grid: SOLO, front: "", hide: ["cabin", "rear"] },
  cabin: { grid: SOLO, front: "", hide: ["front", "rear"] },
  rear: { grid: SOLO, front: "", hide: ["front", "cabin"] },
} satisfies Record<StageLayout, StageArrangement>;
```

`satisfies Record<StageLayout, …>` makes an unhandled layout a compile error. The current CSS silently falls through to the default grid.

- [x] **Step 3: Prove the exhaustiveness check works**

Temporarily add `"quad"` to the `StageLayout` union in `src/lib/types.ts`, then:

```bash
npx tsc --noEmit
```

Expected: FAIL — `Property 'quad' is missing in type ... but required in type 'Record<StageLayout, StageArrangement>'`. Remove `"quad"` again and re-run; expected clean. This confirms the guard is live rather than decorative.

- [x] **Step 4: Create CameraPanel**

Create `src/components/CameraPanel.tsx`. Colour mapping from the spec — `bg-zinc-950` body (was `#111317`), `bg-zinc-900` header (was `#1e2024`), `text-zinc-100` (was `#eee`), `text-zinc-400` header small (was `#8f939b`):

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  actions?: ReactNode;
  footer?: ReactNode;
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}

export function CameraPanel({ title, actions, footer, hidden, className, children }: Props) {
  return (
    <article
      className={cn(
        "flex min-h-0 min-w-0 flex-col bg-zinc-950 text-zinc-100",
        hidden && "hidden",
        className,
      )}
    >
      <header className="flex h-[30px] shrink-0 items-center justify-between bg-zinc-900 px-2.5 text-[10px]">
        <span className="flex items-center gap-2">{title}</span>
        {actions && <div className="flex gap-0.5">{actions}</div>}
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
      {footer && (
        <div className="flex h-[26px] shrink-0 items-center justify-end px-2.5 text-[9px] text-zinc-400">
          {footer}
        </div>
      )}
    </article>
  );
}
```

- [x] **Step 5: Convert CameraView to use CameraPanel**

In `src/components/CameraView.tsx`, replace the `<article className={...}>` wrapper and its `<header>` with `<CameraPanel>`. Keep the canvas element, its `id={camera}`, all pointer handlers and the `tabIndex`/`role`/`aria-label` untouched. Apply to the canvas: `h-full w-full cursor-zoom-in object-cover`. Apply to the error overlay: `absolute inset-0 grid place-items-center bg-zinc-900 p-[30px] text-red-300` (was `#181a20` / `#ec9c98`).

Move the action buttons into the `actions` prop and the zoom slider into `footer`.

- [x] **Step 6: Convert the stage and the inlined rear panel in App.tsx**

Replace the stage `<div className="stage" ...>` with:

```tsx
<div
  id="stage"
  data-layout={cameraLayout}
  data-testid="stage"
  className={cn(
    "relative mx-4 grid min-h-[150px] flex-1 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-700",
    STAGE_LAYOUTS[cameraLayout].grid,
  )}
>
```

`bg-zinc-700` is the gridline colour showing through the 1px gaps (was `#36383b`); `border-zinc-800` was `#303236`.

Bind each camera's visibility and the front panel's row span from the record:

```tsx
const arrangement = STAGE_LAYOUTS[cameraLayout];
// …
<CameraView camera="front" hidden={arrangement.hide.includes("front")}
            className={arrangement.front} … />
<CameraView camera="cabin" hidden={arrangement.hide.includes("cabin")} … />
<CameraPanel title="Rear camera" hidden={arrangement.hide.includes("rear")}> … </CameraPanel>
```

`CameraView` forwards `hidden` and `className` straight through to its `CameraPanel`.

Replace the hand-inlined `<article className="camera rear">` block with `<CameraPanel title="Rear camera" hidden={…}>` wrapping the existing `<video id="rear" ref={rearRef} …>` — keep every attribute and handler.

- [x] **Step 7: Convert the empty state**

Replace `.empty-state` / `.empty-symbol` with utilities. Gradient was `radial-gradient(ellipse at 50% 20%, #272c34, #15171c 70%)`:

```tsx
<div
  id="empty"
  hidden={ready && !player.loading}
  className="absolute inset-0 z-[2] flex flex-col items-center justify-center
             bg-radial-[ellipse_at_50%_20%] from-zinc-900 to-zinc-950 to-70%
             p-5 text-center"
>
  <div className="mb-[15px] rounded-[15px] border border-white/10 bg-white/5 p-[15px] text-zinc-400">
```

Heading `text-[20px] font-[550] tracking-[-0.025em] text-zinc-100`; body `mt-2 mb-[18px] max-w-[340px] text-xs leading-[1.6] text-zinc-400`.

Per the spec, the 10px footnote uses `text-zinc-400`, **not** `text-zinc-500` — `zinc-500` on `zinc-950` is 4.12:1, a WCAG AA fail for normal-size text.

- [x] **Step 8: Convert `.camera-focused`**

The `camera-focused` class on the shell (lines 1295-1323) hides the sidebar and expands the stage when a camera is expanded. Express its effects as conditional utilities on the shell/workspace/stage.

`native-smoke.js:277` currently reads:

```js
document.querySelector(".desktop-shell").classList.contains("camera-focused")
```

`camera-focused` remains a real state flag (it is not a styling class once converted), but `.desktop-shell` is a styling class and goes away. Add `data-testid="desktop-shell"` to the shell element and update the test to:

```js
document.querySelector('[data-testid="desktop-shell"]').classList.contains("camera-focused")
```

This is the only task that adds this hook — Task 7 keeps it, and must not re-add it.

- [x] **Step 9: Delete the converted CSS**

Remove lines 512-702 and 1295-1323 from `src/style.css`. Then confirm nothing dangles:

```bash
grep -n '\.stage\|\.camera\|\.empty-state\|\.empty-symbol\|\.lens-controls\|camera-focused' src/style.css
```

Expected: no hits except `.camera-image video` cursor rules if not yet folded in — fold them into the canvas/video className and delete.

- [x] **Step 10: Verify** (partial — native-smoke not run)

```bash
npx tsc --noEmit && npx eslint src && node --test tests/*.test.ts
```

Then run `tests/native-smoke.js`. The layout loop, the three expand assertions and the "uses window width" assertions must pass.

- [ ] **Step 11: Verify the Lens is not being remounted** (NOT DONE — needs a human)

With a recording open, pan the front camera away from centre, switch to `cabin`, then back to `all`.

Expected: the front camera retains its pan. If it re-centres, `hide` has been implemented as a conditional mount — fix it to use the `hidden` class.

- [x] **Step 12: Commit**

```bash
git add src/
git commit -m "Move stage layout into typed React record; convert stage to Tailwind

The seven stage arrangements were CSS attribute selectors on data-layout,
which could only silently fall through when a layout was unhandled. They are
now a STAGE_LAYOUTS record checked with satisfies Record<StageLayout, ...>, so
an unhandled layout fails to compile.

Hidden cameras keep rendering with display:none rather than unmounting: pan,
zoom and roll live in the Lens instance and its WebGL context, which an
unmount would destroy.

Stage colours move to stock zinc. The stage is deliberately dark in both
themes, so it does not belong on the theme-flipping semantic tokens; measured
against every Tailwind neutral scale, zinc was the closest fit. Seven
near-duplicate mid-greys collapse to zinc-400.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---


**Deviations made during execution** (all verified):

1. `satisfies` -> explicit `Record<StageLayout, StageArrangement>` annotation. Under `satisfies`, `all`'s empty `hide` infers as `never[]`, so the Step 6 call `arrangement.hide.includes("front")` does not compile. The annotation keeps the exhaustiveness guarantee (proved in Step 3).
2. Step 5's `cursor-zoom-in object-cover` for the canvas was wrong on both counts: `.camera canvas` is `cursor: grab` / `active: grabbing`, and `.camera canvas, .camera video` is `object-fit: contain`. `cover` would have cropped the camera image. `zoom-in`/`zoom-out` belongs to the rear `<video>`.
3. Camera action buttons needed explicit `text-zinc-400 hover:bg-zinc-800 hover:text-white size-24` and `[&_svg:not([class*='size-'])]:size-12`. They are ghost Buttons using theme-flipping tokens that `.camera-actions button` was masking by specificity.
4. Three scattered rules the task did not list: `.empty-symbol` / `.empty-state h3` / `.empty-state p` overrides inside the 1180px media query (now `max-[1180px]:` variants), and the `.camera-focused .stage` / `.camera-image video` pair, which had to move because their target classes were removed. The rest of `.camera-focused` targets classes Task 3 does not remove and stays in CSS.
5. `.desktop-shell` is selected at `native-smoke.js` **277 and 303**, not just 277. Both updated.
6. `.camera-number`, `.camera header small` and `.empty-state > span` had no JSX using them — dead rules, deleted rather than converted. `.loading-spin` and its `@keyframes spin` are replaced by Tailwind's `animate-spin`, which supplies its own `@keyframes spin` (verified in the built CSS).
7. All class strings in this task were written under the pre-`--spacing: 1px` scale and were converted by 3.25x when applied (`px-2.5` -> `px-8`, `mx-4` -> `mx-16`).

**Verification note:** a class whose declarations are byte-identical to another class is emitted by Tailwind as a merged selector list (`.min-h-150,.min-h-\[150px\]{min-height:150px}`). Checking the built CSS with a `\.name\{` regex gives false negatives; match on the class name as a substring.
### Task 4: Convert Transport

**Files:**
- Modify: `src/components/Transport.tsx`, `src/style.css` (remove 926-1015, 1226-1294)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing consumed by later tasks

- [x] **Step 1: Read both scattered blocks**

```bash
grep -n '\.playback\|\.timeline\|\.transport\|\.status-dot\|\.play-button\|\.audio\|\.speed-readout\|\.recorded-time\|\.telemetry-readout' src/style.css
```

`.transport` @ 950 **and** 1226, `.transport-buttons` @ 979 **and** 1273, `.audio` @ 1007 **and** 1269, `.transport-buttons button small` @ 987 **and** 1292. The later block wins — convert to the *effective* computed style, not the first definition.

- [x] **Step 2: Convert the timeline row**

`.timeline` → `flex items-center gap-2.5 px-4`; its spans → `text-[10px] tabular-nums text-muted-foreground`; the range input keeps `id="seek"` and gains `flex-1`.

- [x] **Step 3: Convert the readouts**

`.speed-readout` → `flex items-baseline gap-[5px]`, its `<strong>` → `text-[25px] font-[550] leading-none tracking-[-0.05em] tabular-nums`, its `<span>` → `text-[10px] text-muted-foreground`, its svg → `self-center mr-1 text-muted-foreground`.

`.recorded-time` → `flex flex-col justify-center gap-[3px] border-l border-border pl-3 text-[10px] leading-none tabular-nums whitespace-nowrap text-muted-foreground`, its `<strong>` → `text-xs font-medium text-foreground`.

- [x] **Step 4: Convert the transport buttons**

`.transport-buttons` → `flex items-center gap-1`. The `<small>` badge on the seek buttons → `absolute text-[7px] font-semibold`. `.play-button` keeps `id="play"` and the shadcn `size="icon-lg"`.

- [x] **Step 5: Convert the audio group**

`.audio` → `flex items-center gap-1 justify-self-end`; the volume input → `w-[70px]` with `accent-primary` replacing the hardcoded `accent-color: #618dc1`.

- [x] **Step 6: Fold in the 1180px overrides**

Lines 1226-1294 narrow gaps and shrink the volume input below 1180px. Express as responsive variants using an arbitrary breakpoint, e.g. `max-[1180px]:gap-0.5` and `max-[1180px]:w-[50px]`.

- [x] **Step 7: Delete the converted CSS**

Remove lines 926-1015 and 1226-1294. Re-grep to confirm no dangling `.transport*` / `.audio` / `.timeline` selectors remain.

- [x] **Step 8: Verify**

```bash
npx tsc --noEmit && npx eslint src && node --test tests/*.test.ts
```

Then run `tests/native-smoke.js` — it drives `$("play")`, `$("seek")`, `$("mute")`, `$("speed")`, `$("car-speed")` and `$("status-text")`.

- [x] **Step 9: Commit**

```bash
git add src/
git commit -m "Convert Transport to Tailwind utilities

Folds in the sub-1180px overrides that were defined 300 lines away from the
base rules as responsive variants, and replaces the hardcoded volume slider
accent-color with the primary token.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```


**Execution notes (Task 4):**

- Step 8 is PARTIAL. `tsc --noEmit`, `eslint src`, `node --test` (8/8) and
  `bun run build` all pass. `tests/native-smoke.js` was NOT run — it executes
  inside the Tauri debug app via `webview.eval` against a real recordings
  folder, and no browser automation is available in this session. The ids it
  drives (`play`, `seek`, `mute`, `speed`, `car-speed`, `status-text`) are all
  still present in the JSX; that is a static check, not the test.
- The plan's numbers were taken from each selector's FIRST definition, but
  several were overridden later in the file. The effective values were used:
  `.transport-buttons` gap 6px (not 4), skip badge 8px (not 7),
  `.speed-readout strong` 23px (not 25), `.audio` gap 5px (not 2),
  `.audio input` 75px (not 70). `.speed-readout` itself was defined at line 521,
  outside the plan's stated line range.
- The transport buttons' CSS sizes (40px; play 50px) beat the shadcn `size`
  variants by specificity, so they are explicit `size-*` utilities.
- `.recorded-at` and `.status-dot` were dead CSS — no JSX referenced them.
- `accent-primary` was applied to all three range inputs (seek, volume,
  front-zoom) and `accent-color: #618dc1` removed from the global
  `input[type="range"]` rule; the plan's volume-only change would have left the
  zoom slider inconsistent. That rule keeps `height: 12px; cursor: pointer`
  for Task 8.
- `style.css`: 1074 -> 874 lines, braces balanced 143/143.

---

### Task 5: Convert TelemetryPanel and RouteMap

**Files:**
- Modify: `src/components/TelemetryPanel.tsx`, `src/components/RouteMap.tsx`, `src/App.tsx` (the `.telemetry-resize` separator and `.telemetry-container`), `src/style.css` (remove 711-925, 1137-1143, 1184-1225; **keep** 850-860)
- Modify: `tests/native-smoke.js:208` (`.graph-panel` selector)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing consumed by later tasks

- [x] **Step 1: Read the scattered blocks**

```bash
grep -n '\.telemetry\|\.map-section\|\.graph-\|\.route-\|\.axis-values\|\.sensor-note\|\.map-note\|\.map-loading\|\.leaflet' src/style.css
```

`.map-section > header` @ 805 **and** 1190; `.graph-heading select` @ 878 **and** 1223.

- [x] **Step 2: Preserve the Leaflet overrides**

Lines 850-860 (`.leaflet-container`, `.leaflet-control-attribution`, `.leaflet-control-zoom`) style third-party DOM that Leaflet creates itself. They **stay** in `style.css` — they are part of the ~160-line floor. Do not convert or delete them.

- [x] **Step 3: Convert the map section**

`.map-section` → `relative min-h-0 border-r border-border`. Its floating header chip → `absolute top-2 left-2 z-[500] flex items-center gap-[5px] rounded border border-border bg-background px-[7px] py-1 text-[9px] shadow-sm pointer-events-none` (note: the close button inside needs `pointer-events-auto`).

- [x] **Step 4: Convert the graph panel**

`.graph-panel` → `flex min-h-0 flex-col px-[13px] pt-2.5 pb-[7px]` plus `data-testid="graph-panel"` (replaces the `.graph-panel` selector at `native-smoke.js:208`).

`.graph-heading` → `flex shrink-0 items-center gap-2.5 text-[9px]`; its select → `ml-auto max-w-[190px] rounded border border-border bg-secondary px-[3px] py-0.5 text-[9px]`.

- [x] **Step 5: Convert the axis legend**

`.axis-values` → `flex gap-3 text-[9px]`, with `max-[1180px]:gap-2`; its labels keep the inline `style={{ color: a.color }}`.

Leave the three `axes` colours in `TelemetryPanel.tsx:8-12` unchanged. Retinting the chart series is a separate concern from this migration and belongs in its own change.

- [x] **Step 6: Convert the resize separator and container**

In `src/App.tsx`, `.telemetry-resize` → `group relative h-1 shrink-0 cursor-row-resize`, its inner `<span>` → `absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border group-hover:bg-ring`. Keep every ARIA attribute and pointer handler.

`.telemetry-container` keeps its inline `style={{ height }}` and gains `shrink-0 overflow-hidden max-[780px]:max-h-[180px]`.

- [x] **Step 7: Delete the converted CSS**

Remove 711-849, 861-925, 1137-1143 and 1184-1225. **Do not remove 850-860.** Then:

```bash
grep -n '\.leaflet' src/style.css
```

Expected: the three Leaflet rules still present.

- [x] **Step 8: Verify**

```bash
npx tsc --noEmit && npx eslint src && node --test tests/*.test.ts
```

Then run `tests/native-smoke.js`. It exercises map/graph show-hide independently, asserts `#route-map img.leaflet-tile` renders at 256px, checks `.leaflet-container` count stays 1 after remount, and asserts the graph rows fit the panel.

- [x] **Step 9: Commit**

```bash
git add src/
git commit -m "Convert TelemetryPanel and RouteMap to Tailwind utilities

Keeps the three Leaflet overrides in style.css: they target DOM Leaflet
creates itself, which utilities cannot reach.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Execution notes (Task 5):**

- Preserved effective current CSS where the examples were stale: 12px resize
  target with a 28×3px grip, 180px minimum/40vh maximum container height,
  10px graph top padding, 14px legend gap, and the later map-header overrides.
  The 780px breakpoint is based on window **height**, not width.
- Converted focused-camera hiding to conditional utilities and retained all
  pointer/keyboard handlers, IDs, chart colors, and dynamic inline styles.
  All three Leaflet override blocks remain unchanged.
- Typecheck, lint, all 8 logic tests, production build, native debug build,
  and `git diff --check` passed. The native WKWebView smoke suite passed all
  79 assertions using the existing `~/Documents/Dashcam` fixtures, including
  graph fit, map tiles, independent panel visibility, and remount checks.
  Report: `~/Library/Caches/app.comtec.studio/native-smoke.json`.
- Spec and code-quality reviews passed. The manual two-theme visual pass
  remains part of Task 8.

---

### Task 6: SidebarRow and LibrarySidebar

**Files:**
- Create: `src/components/SidebarRow.tsx`
- Modify: `src/components/LibrarySidebar.tsx`, `src/style.css` (remove 226-284, 302-456)
- Modify: `tests/native-smoke.js` (`.clip` and `.folder` selectors)

**Interfaces:**
- Consumes: `cn` (Task 1)
- Produces: `SidebarRow` from `@/components/SidebarRow`, typed as
  `ComponentProps<"button"> & { variant?: "folder" | "clip" }`. Selected state
  is expressed with the existing `aria-current` attribute (the `cva` base
  includes `aria-[current=true]:bg-secondary`); `data-testid` passes through
  like any other button prop.

- [x] **Step 1: Read the scattered blocks**

```bash
grep -n '\.folder\|\.clip\|\.search-field\|\.library-\|\.sidebar-heading\|\.column-heading\|\.open-folder' src/style.css
```

`.folder` @ 336 **and** 380; `.clip` @ 368 **and** 379; `.search-field` @ 260 **and** 278; `.library-error` @ 449 **and** 454.

- [x] **Step 2: Create SidebarRow**

The two rows share `display:flex; align-items:center; gap:7px; width:100%; text-align:left; border-radius:6px` and differ only in padding (`10px 5px` vs `11px 7px`) and margin-bottom (`3px` vs `2px`) — drift, not intent. The variant unifies them:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const row = cva(
  "flex w-full items-center gap-[7px] rounded-md text-left transition-colors hover:bg-muted aria-[current=true]:bg-secondary",
  {
    variants: {
      variant: {
        folder: "mb-[3px] px-[5px] py-2.5",
        clip: "relative mb-0.5 px-[7px] py-[11px]",
      },
    },
    defaultVariants: { variant: "clip" },
  },
);

export function SidebarRow({
  variant, className, ...props
}: ComponentProps<"button"> & VariantProps<typeof row>) {
  return <button className={cn(row({ variant }), className)} {...props} />;
}
```

- [x] **Step 3: Use it for both rows and add the test hooks**

In `LibrarySidebar.tsx`, replace `<button className="folder" …>` with `<SidebarRow variant="folder" data-testid="folder" …>` and `<button className="clip" …>` with `<SidebarRow variant="clip" data-testid="clip" …>`. Keep `data-folder`, `data-id`, `aria-current` and `title` exactly as they are.

- [x] **Step 4: Convert the rest of the sidebar**

`.library-sidebar` → `flex min-h-0 flex-col gap-2 border-r border-border bg-[var(--chrome)] p-2.5`; `.search-field` → `relative flex items-center gap-1.5 rounded-md border border-border bg-background px-2`; `.library-columns` → `grid min-h-0 flex-1 grid-cols-[126px_minmax(0,1fr)] gap-2 max-[1180px]:grid-cols-[112px_minmax(0,1fr)]`; `.column-heading` → `px-1 pb-1 text-[9px] font-semibold tracking-[0.06em] text-muted-foreground`.

`.folder > svg` used `#868d97` — one of the six Group B leaks. Replace with `text-muted-foreground`, **not** a zinc value; this is app chrome and must flip with the theme.

- [x] **Step 5: Update the smoke test**

Change `document.querySelectorAll(".clip")` → `'[data-testid="clip"]'` and `document.querySelectorAll(".folder")` → `'[data-testid="folder"]'` at `native-smoke.js:23,31,179,182,222`.

- [x] **Step 6: Delete the converted CSS**

Remove lines 226-284 and 302-456.

- [x] **Step 7: Verify**

```bash
npx tsc --noEmit && npx eslint src && node --test tests/*.test.ts
```

Then run `tests/native-smoke.js` — it asserts `folder sessions grouped` finds exactly 4 folders and selects clips by name.

- [x] **Step 8: Commit**

```bash
git add src/ tests/native-smoke.js
git commit -m "Extract SidebarRow; convert LibrarySidebar to Tailwind

The folder and clip rows were the same pattern with drifted padding
(10px 5px vs 11px 7px) and margin (3px vs 2px). A cva variant unifies them.

Replaces the class-based smoke-test selectors with data-testid so styling
changes cannot silently break the suite.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Execution notes (Task 6):**

- Rescaled the plan's pre-`--spacing: 1px` examples so the rendered padding
  and gaps remain pixel-correct. `SidebarRow` also uses an explicit 6px radius
  because Tailwind's named radius scale remains rem-based.
- Replaced the search field's hardcoded blue focus outline with the existing
  ring token. Focused-camera hiding now lives beside the sidebar utilities via
  an ancestor variant, so the removed `.library-sidebar` rule has no dangling
  styling hook.
- Typecheck, lint, all 8 logic tests, production and native debug builds, and
  `git diff --check` passed. The final native WKWebView smoke run passed all 79
  assertions, including four-folder grouping and clip selection. Two earlier
  runs stopped on timing-sensitive media synchronization before reaching the
  sidebar assertions; neither failure touched code changed by this task.
- Spec and code-quality reviews passed after the spacing-scale corrections.

---

### Task 7: Convert the shell

**Files:**
- Modify: `src/App.tsx`, `src/components/AppErrorBoundary.tsx`, `src/style.css` (remove 177-225, 457-491, 1016-1022, 1032-1067, 1129-1136, 1144-1183)
- Modify: `tests/native-smoke.js:283` (`.workspace` selector)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing consumed by later tasks

- [x] **Step 1: Read the scattered blocks**

```bash
grep -n '\.desktop-shell\|\.titlebar\|\.workspace\|\.review\|\.app-name\|\.settings-dialog\|\.theme-options\|\.startup-error\|\.playback-error\|\.decoder\|\.eyebrow\|\.recording-' src/style.css
```

`.titlebar` @ 183 **and** 1174; `.titlebar-left` @ 193 **and** 1177.

- [x] **Step 2: Convert the shell and titlebar**

`.desktop-shell` → `flex h-full flex-col select-none`. Task 3 already added `data-testid="desktop-shell"` and the `camera-focused` state class — keep both, do not re-add.

`.titlebar` → `flex h-[49px] shrink-0 items-center justify-between border-b border-border bg-[var(--chrome)] pr-4 pl-[82px]`. The 82px left padding clears the macOS traffic lights; keep it. Keep `data-tauri-drag-region="deep"`.

- [x] **Step 3: Convert workspace and review**

`.workspace` → `grid min-h-0 flex-1 grid-cols-[334px_minmax(0,1fr)] max-[1180px]:grid-cols-[290px_minmax(0,1fr)]` plus `data-testid="workspace"`; the sidebar-hidden state → `grid-cols-[minmax(0,1fr)]`.

This is the last of the five class-based smoke selectors. Update `native-smoke.js:283`:

```js
// before
document.querySelector(".workspace").getBoundingClientRect().width
// after
document.querySelector('[data-testid="workspace"]').getBoundingClientRect().width
```

Then confirm none remain:

```bash
grep -nE 'querySelector(All)?\("\.' tests/native-smoke.js
```

Expected: only `.leaflet-container` and `.leaflet-tile`, which are third-party class names and stay.

`.review` → `flex min-h-0 min-w-0 flex-col`; `.review-heading` → `flex items-center gap-3 px-4 py-3 max-[1180px]:flex-wrap max-[1180px]:gap-[7px] max-[1180px]:px-4 max-[1180px]:py-2.5`.

- [x] **Step 4: Convert the settings dialog and error boundary**

`.settings-dialog` sections, headings and the `<dl>` grid → utilities. `.startup-error` in `AppErrorBoundary.tsx` → utilities; its bare `<button>` becomes the shadcn `<Button>`.

- [x] **Step 5: Convert `.decoder`**

The hidden `<video id="source">` decoder element must stay in the layout but invisible. Keep its current technique exactly (check lines 1023-1031 — if it uses `position:absolute; opacity:0` rather than `display:none`, preserve that; `display:none` on a `<video>` can suspend decoding in WebKit and would break playback).

- [x] **Step 6: Delete the converted CSS**

Remove the listed ranges.

- [x] **Step 7: Verify**

```bash
npx tsc --noEmit && npx eslint src && node --test tests/*.test.ts
```

Then run `tests/native-smoke.js` and confirm playback still works — this is the task that touches the decoder element.

- [x] **Step 8: Commit**

```bash
git add src/
git commit -m "Convert application shell to Tailwind utilities

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Execution notes (Task 7):**

- The plan's utility examples predate `--spacing: 1px`, so they were rescaled
  to keep the rendered pixels: the titlebar is `h-49 pr-16 pl-90`, not the
  plan's `h-[49px] pr-4 pl-[82px]`. The 90px left padding is what the
  pre-migration stylesheet used to clear the traffic lights.
- The hidden decoder keeps its original technique (`fixed`, 1×1px,
  `opacity-0`, `pointer-events-none`). It is never `display: none`.
- `AppErrorBoundary` now uses the shadcn `Button`.
- Committed together with Task 8: both tasks edit the same hunks of
  `App.tsx` and `style.css`, so one commit covers Steps 8 of both.

---

### Task 8: Remove the global focus ring, map Group B leaks, final prune

**Files:**
- Modify: `src/style.css` (final form), any component still relying on the global focus outline

**Interfaces:**
- Consumes: everything prior
- Produces: `src/style.css` at ~160 lines

- [x] **Step 1: Delete the global focus ring**

Remove the `:focus-visible { outline: 2px solid #5489cf; outline-offset: 2px }` rule at lines 170-173 and the duplicate at 279. This is the inconsistency that motivated the whole migration: `ui/button.tsx` uses `focus-visible:ring-3 focus-visible:ring-ring/30` while every raw control used the hardcoded blue outline.

- [x] **Step 2: Give every remaining focusable element a token-based ring**

```bash
grep -rnE '<(input|select|canvas|video|a) ' src/ | grep -v 'focus-visible:'
```

For each hit, add `focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none`. Elements inside the dark stage (canvas, rear video) should use `focus-visible:ring-zinc-400/50` so the ring is visible against `zinc-950`.

- [x] **Step 3: Map the remaining Group B leaks**

```bash
grep -nE '#[0-9a-fA-F]{3,8}' src/style.css
```

Expected remaining: only the `--selection`, `--selection-text`, `--chrome` and `--stage` token definitions in `:root` / `.dark`. Retire `--stage` if nothing references it (the stage now uses `bg-zinc-950`). Any other hit is an unconverted rule — convert it.

- [x] **Step 4: Verify the final stylesheet shape**

```bash
wc -l src/style.css
grep -cE '^\.[a-z]' src/style.css
```

Expected: ~160 lines; the only remaining top-level class selectors are `.dark` and the three `.leaflet-*` rules. Any `.camera`, `.stage`, `.clip` or `.titlebar` hit means something was missed.

- [x] **Step 5: Confirm no dead classNames remain in the JSX**

```bash
grep -ohE 'className="[a-z][a-z0-9 -]*"' src/**/*.tsx src/*.tsx | sort -u
```

Every remaining value must be a Tailwind utility. A bare semantic name like `className="review"` is a leftover with no rule behind it — remove it.

- [x] **Step 6: Full verification**

```bash
npx tsc --noEmit && npx eslint src && node --test tests/*.test.ts && npm run build
```

Then run `tests/native-smoke.js` end to end. Every assertion must pass.

- [ ] **Step 7: Manual two-theme pass (required)** (PARTIAL — checked in a browser preview, not yet in the native window; see execution notes)

The smoke suite asserts behaviour, not appearance, and this migration deliberately folded visual fixes in. Open the app and check in **both** light and dark:

1. Titlebar, sidebar, review header, transport — no unstyled or mis-coloured elements
2. The stage stays dark in light mode (it must **not** follow the theme)
3. Empty state gradient and symbol render correctly
4. Focus rings are consistent — Tab through the titlebar, switcher, sidebar, transport; every stop should show the same ring treatment
5. Settings dialog and tooltip open/close animations still play (proves the Task 1 `shadcn` fix)
6. Resize below 1180px and below 780px height; both breakpoints behave as before

- [x] **Step 8: Commit**

```bash
git add src/
git commit -m "Retire the global focus ring; complete Tailwind migration

Deletes the hardcoded :focus-visible outline that competed with the
token-based ring on shadcn components, which was the inconsistency that
motivated this migration. style.css is now tokens, base layer and three
Leaflet overrides.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Execution notes (Task 8):**

- `style.css` is 192 lines rather than ~160: tokens, base layer and three
  Leaflet overrides, with no component rules. The only hex colours left are
  `--selection`, `--selection-text` and `--chrome`; `--stage` was retired.
- The only focusable element without a token ring is Leaflet's attribution
  link, which is third-party markup.
- Typecheck, lint, all 8 logic tests and the native debug build pass. The
  native WKWebView smoke suite passed all 87 assertions on four runs,
  including one with the window deliberately covered. A fifth run failed only
  the settings-width check described below.
- An earlier run on this tree timed out waiting for playback on the second
  fixture. It did not reproduce. The playback code and the Rust track handler
  are byte-identical to the previous commit, and that run's recording opens
  were 5–8× slower than normal; the cause is unknown. A debug-only
  `window.show()` / `set_focus()` hook added while chasing it was removed
  again because it was never shown to matter. Known gap, unchanged by this
  migration: `PlaybackSync.reconcile()` awaits `play()` with no timeout.
- The smoke suite's settings-width check now reads `offsetWidth` instead of
  `getBoundingClientRect()`. WebKit freezes the dialog's zoom-in animation
  while the page is hidden, which made the transformed rect read 418px
  (440 × 0.95) whenever the window was not visible.
- Step 7 was carried out in a Chromium preview against a mocked backend, in
  light and dark, at 1440×900 and 1100×740: consistent rings on every enabled
  tab stop, the stage stays dark in light mode, the dialog's enter animation
  runs, the sidebar narrows to 290px with no overflow. This session cannot
  capture the native window, so the same pass in WKWebView is still owed by a
  human, along with Task 2 Step 10 and Task 3 Step 11.

---

## Rollback

Each task is one commit and the app builds at every step, so `git revert <sha>` backs out any single stage. Task 1 is independent of the rest and should be kept regardless of how far the migration proceeds.
