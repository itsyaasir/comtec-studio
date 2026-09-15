# Validation — 15 September 2026

## Playback controls and workspace refinements

- All **81 native checks** pass with the real recordings, including rapid play/pause, pause during seeking, autoplay within/across sessions, final-recording stop/replay, stale completion events, and six repeated recording loads.
- Four new decoder-controller regression tests pass (eight frontend tests total). They cover late play completion after Pause, buffering, a stopped decoder rejoining playback, and disposal during a pending play call.
- All 12 Rust tests pass with actual fixtures enabled; React lint, TypeScript, Clippy with warnings denied, and production packaging pass.
- Map and Acceleration close independently and can be restored from the transport strip. Speed remains visible with both panels closed. Redundant GPS/playback captions and the footer were removed.
- Clicking front/cabin/rear expands that camera across the window; Escape restores the previous layout. Native tests verify window-width expansion and pausing all cameras while expanded. Hover movement no longer suppresses accessibility clicks.
- Native traffic lights, sidebar button, and app title share the same baseline. Play/Pause is 50px, with larger adjacent controls.
- An intermittent repeated-load timeout occurred during an earlier run. Per-open media URLs now include a generation token to avoid sharing a WKWebView loading session. The final suite, including repeated opens, passed.
- Original fixture checksums remain unchanged. Installed viewers are not replaced.

## React desktop UI rewrite

`chore/react-desktop-ui` rewrites the frontend using React 19.3, shadcn Luma, and Tailwind 4 on Vite 8. The tested Rust direct-playback backend remains unchanged.

- Recommended React Hooks ESLint rules pass with no warnings or disabled rules; TypeScript and production Vite build pass.
- Four frontend model tests and all 12 Rust tests pass, including actual recording indexes and telemetry.
- The initial production-asset native run passed 39 playback checks. The extended run with React development assets and StrictMode enabled passed all **47** checks after correcting Settings focus restoration.
- Native checks cover garage/night/short recordings, direct track URLs, paused load, synchronized play/pause/seek, 2× speed, end/replay, mute, view reset, rapid selection, recorded speed, missing GPS, sensor graphs, seven layouts, and session grouping.
- Additional checks verify actual 256px street-map images, telemetry hide/remount, a single Leaflet container after remount, dialog focus containment, dark/light appearance, Escape dismissal, and focus returning to Settings.
- A further production-React native run passed all 47 checks. The release restored 198 SD-card recordings and was visually observed playing daylight clip `002_150113_A.mp4`, showing 67 km/h, the street map, sensor traces, and all three camera views.
- One release launch through the UI automation tool showed a blank window. Restarting the unchanged binary restored the workspace; the diagnostic production-React run did not reproduce a startup error. A root error boundary now provides recovery for unexpected React rendering failures. The final signed bundle was then opened successfully through normal macOS Launch Services and restored all 198 SD-card recordings.
- The three fixture SHA-256 checksums match their pre-test values.
- Production release build, ad-hoc signature verification, and system-library-only linkage checks pass. The installed viewers were not replaced.
- This is a macOS-styled React interface in Tauri's native window; controls inside the webview are not AppKit controls. Public Developer ID signing/notarization remains outside this local build.

The debug smoke script is opt-in and reports to the app cache; no private footage or GPS trace is committed. React development assets were used only for the lifecycle validation build. The release uses production React assets.

## Previous branch: direct playback with mp4-atom

The remux fallback, FFmpeg/FFprobe executables, helper-build scripts, and playback-cache controls are removed. `mp4-atom` 0.15 handles standard headers, timing fields, and chunk-offset decoding/encoding. The virtual-file mapping retains original sample bytes.

- 12 Rust tests passed, including actual recording indexes and telemetry.
- 39 packaged native checks passed with direct camera URLs for garage, night, and short recordings.
- Release build and code-signature validation passed; the release contains no media helper executables.
- Original fixture SHA-256 checksums remain unchanged.
- Earlier verification below describes historical builds and their former dependencies.

## Original delivered build

- Product: COMTEC Studio 0.1.0, Apple Silicon arm64.
- Tauri 2.11.5 / WKWebView, bundled frontend and minimal FFmpeg 8.0.1 helpers.
- Release bundle: approximately 28 MB, including corresponding FFmpeg source and license.
- Minimum build target: macOS 12; runtime verification applies to this user's Mac.
- Locally ad-hoc signed; `codesign --verify --deep --strict` passes. Public Developer ID signing/notarization is not configured.

## Initial playback verification

A packaged debug app using embedded production frontend assets completed 24 native smoke assertions. It did not use Vite, Python, Chrome, or the old viewer service. The opt-in test hook is absent from release builds.

| Fixture                    | Verified behavior                                               | Observed drift during playback |
| -------------------------- | --------------------------------------------------------------- | ------------------------------ |
| Garage, `000_023859_A.mp4` | Paused load, play/pause, both cameras seek to 25s, 2× playback  | 64 ms                          |
| Night, `000_025643_A.mp4`  | Paused load, play/pause, both cameras seek to 25s, 2× playback  | 15 ms                          |
| Short, `015_025359_A.mp4`  | Paused load, play/pause, midpoint seek, 2× playback, end/replay | 30 ms                          |

These are observations from individual checks, not a guarantee for every frame or recording. The renderer was also visually observed displaying front, cabin, and rear footage together in the native window. The native suite additionally checked all 26 library entries, mute, front-view reset, and rapid-selection stale-result protection.

The main video reports 1856 × 1856 and the rear video reports 1920 × 1080. Both are decoded by WKWebView. Front and cabin are independently projected by the new WebGL implementation.

## Installed release observation

The installed release at `~/Applications/COMTEC Studio.app` was launched through macOS Launch Services. It restored the user-selected SD card folder and discovered 198 recordings. The release was visually observed playing daylight recording `20260914_012/002_150113_A.mp4` with all three views visible and transport advancing. Process inspection found no network sockets on either the test app or release app; the old viewer server remained untouched.

## Backend and build

- TypeScript check and production frontend build pass.
- Six Rust tests pass, including explicitly enabled real-fixture tests.
- Clippy passes with warnings denied.
- Discovery test excludes Preview, hidden files/directories, and symlinks, and checks identity invalidation.
- Timing tests cover format-duration fallback, start offset, invalid duration, and unsupported codec.
- Lifecycle test starts a long-running helper, cancels it, and verifies that the child is reaped promptly.
- Real-fixture tests invoke the newly built helpers, validate both prepared camera outputs, reuse the cache, and verify source identity is unchanged.
- SHA-256 checksums of the three original recordings match their pre-test values.
- Bundled FFmpeg and FFprobe link only to macOS system libraries; neither requires Homebrew. Their deployment target is macOS 12.0.
- The app uses Tauri's local, byte-range-capable asset protocol, scoped to its own media cache. Seeking tests exercise this path.
- The installed COMTEC Viewer and its source/cache, original recordings, and existing Preview exports were not modified.

## GPS, graphs, and layout update

- The packaged native smoke suite passed 36 assertions against the garage, night, and short recordings. This adds recorded speed, GPS route loading, missing-fix handling, six layout switches, session grouping, and graph containment to the original playback checks.
- Live OpenStreetMap tiles were requested with the user's explicit approval and visually verified inside the native app, alongside the recorded route, speed, and all three green/red/purple traces.
- The updated installed release restored all 198 SD-card recordings. Daylight clip `20260913_002/013_162121_G.mp4` displayed 49 km/h, live street tiles, all three graphs, and upright cabin occupants. Playback was started through the native controls.
- The cabin now has a 180° roll, revised framing, and its own rotation control. Full cabin mode was visually checked against the actual footage. Four frontend tests cover the camera projection direction and recording groups/types.
- The Rust telemetry parser's real-fixture test verified 600 samples without GPS in the garage, 600 with GPS in the night clip, and 64 with GPS in the short clip. Twelve Rust tests pass when real-fixture tests are enabled.
- TypeScript, the release build, Clippy with warnings denied, bundle signing, and system-only dynamic dependency checks pass.
- Earlier no-network-socket observations apply to the original playback-only build. The updated app makes outbound HTTPS requests for visible map tiles; playback still requires no server.

## Boundaries

Lens correction is approximate. The sensor display offers raw acceleration and consecutive-sample changes; it does not reproduce the vendor's undocumented smoothing/calibration. Export is not implemented. Testing covers representative garage/night/short recordings rather than every recording. Public distribution signing and verification on other Macs remain separate work.
