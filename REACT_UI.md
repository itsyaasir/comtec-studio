# React desktop UI

The UI rewrite lives on `chore/react-desktop-ui`, based on `main` at `202d116`. The direct-playback backend was merged first. This branch replaces the imperative frontend with React; original recordings and installed viewers remain outside the change.

## Stack

- React 19.3, TypeScript, Vite 8, and Tailwind CSS 4.
- Official shadcn/ui **Luma** preset with Radix primitives. `components.json` records the preset; generated components live in `src/components/ui`.
- macOS system typography, native window controls, a resizable and collapsible session sidebar, seven camera layouts, and light/dark/system appearance.
- The workspace is a shadcn `Resizable` group (`react-resizable-panels`). shadcn's `Sidebar` collapses but cannot be resized, so it is not used. The library panel keeps its pixel width when the window resizes and unmounts its contents while collapsed.
- Existing Rust Tauri commands, direct `track:` playback, telemetry parsing, and WebGL projection.

## Boundaries and practices

`App` composes the workspace. `useLibrary` owns discovery, filtering, and folder selection; groups are derived from library state. `usePlayback` owns loading, seeking, cancellation, and stale-response protection. `PlaybackSync` owns the shared decoder intent and reconciles native play/pause events; it rejects late play events after Pause. Completion subscriptions advance through the full library without rebuilding media listeners. It exposes renderable state separately from video refs.

Camera views own and dispose their WebGL resources, pointer listeners, resize observers, and animation loops. RouteMap owns its Leaflet instance and removes it when hidden or unmounted. The map is loaded as a separate local chunk. GPS and media requests start independently.

React state drives controls. Fast-changing media and renderer values live in refs, while the displayed timeline updates at about 10 Hz. Memoized library data and camera components avoid rebuilding lists and renderers on each tick. Global keyboard handling uses React's Effect Event API to read current playback state without repeatedly subscribing.

React StrictMode remains enabled in development. ESLint enforces the recommended React Hooks rules, including dependencies, refs, and effect state updates; no rules are disabled. There is no extra global state library or server framework. The settings dialog uses Radix focus management and Escape handling, and controls have accessible labels and keyboard operations.

`src/style.css` contains the Luma tokens, global base rules, and three Leaflet overrides. Application layout and keyboard focus styles live in Tailwind utilities beside their components. `cn` and `shadcn` are runtime dependencies because the application imports their class helper and CSS. The packaged app contains local assets and requires no frontend server.

## Guidance consulted

- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React: Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
- [React Hooks ESLint plugin](https://react.dev/reference/eslint-plugin-react-hooks)
- [Vercel's React best-practices skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices): applicable client-side guidance on parallel requests, derived state, rerenders, and refs. Next.js/server-specific rules do not apply to this local Tauri app.
- [shadcn Luma](https://ui.shadcn.com/docs/changelog/2026-03-luma) and [Vite setup](https://ui.shadcn.com/docs/installation/vite)
- Local `frontend-design` and `tauri-v2` skills.

## Verification

Run `bun run lint`, `bun run build`, and `bun run test`. The native smoke suite exercises real garage, night, short, and parking recordings, plus live maps, independent panels, expansion, repeated loading, and autoplay. Decoder-controller unit tests cover late native events and cancellation. See `VALIDATION.md` for observed results.

Native traffic lights use Tauri’s [trafficLightPosition configuration](https://v2.tauri.app/reference/config/#windowconfig), aligned with the 49px React titlebar. Camera expansion retains the same video elements and renderer instances. Map and acceleration visibility are independent of the speed readout.
