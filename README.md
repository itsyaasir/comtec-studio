# COMTEC Studio

A standalone Apple Silicon macOS application for reviewing original two-camera COMTEC recordings. Built from scratch with Tauri v2, React, TypeScript, Rust, and a WebGL fisheye renderer.

## Open the app

The current branch build is `src-tauri/target/release/bundle/macos/COMTEC Studio.app`. Double-click it to launch. The separately installed `~/Applications/COMTEC Studio.app` remains the earlier release. The original COMTEC Viewer is also preserved.

The app contains its frontend and Rust media reader. Playback needs no Terminal, Python, Homebrew, separate browser, network connection, or localhost server. The embedded OpenStreetMap street layer uses an internet connection; recorded GPS routes and sensor data remain local. Map tile requests disclose the viewed area and your IP address to OpenStreetMap. The current build is locally ad-hoc signed for Apple Silicon. It is not Developer ID signed or notarized for public distribution. macOS 12+ is the build target; live verification was performed on this Mac only.

Choose **Open recordings folder**, then select a clip. The default first-run location is the user's Documents/Dashcam folder. The app remembers the selected folder. Hidden files, symlinks, and Preview directories are excluded.

- Front and cabin are independently adjustable perspectives from the circular video track.
- Rear uses the second camera track. One controller governs both native decoders, including late playback events and buffering.
- Playback automatically advances through the library in folder/file order, clearing search/type filters as it advances. The final recording stops; Play replays it.
- Click a camera to expand it across the window. Click again or press Escape to restore the layout. Drag the front/cabin view to look around; scroll to zoom.
- Choose All views, Front, Split (front/cabin), Panorama, Round (original circular image), Cabin, or Rear. Cabin starts upright and includes a 180° rotation button.
- The folder column groups clips by recording date/session. Select a folder to see its clips, or search across the library. Driving, parking, and event filters use COMTEC file types.
- The transport strip shows recorded km/h and recording time. Separate panels show a GPS route with a moving position and X/Y/Z acceleration graphs. Click the graph to seek. GPS-unavailable recordings show no invented position or zero speed.
- Switch between raw acceleration (including gravity) and sample-to-sample changes (Δg). Axis colors follow the original viewer: green forward/backward, red left/right, purple up/down.
- Space plays or pauses; left/right arrows seek five seconds. Focused camera arrow keys pan instead.
- F toggles native fullscreen, retaining the transport controls.
- Settings includes system/light/dark appearance, playback information, and keyboard shortcuts.
- Toggle the library from the titlebar. Close Map or Acceleration independently using its × button; restore either from the transport strip. Drag the divider above the panels to resize them. ⌘ K focuses search.

Original footage is opened read-only. Supported recordings play directly through an in-memory camera index, with no prepared video copies. Keep the original drive connected while playing. Unsupported layouts show an error; there is no conversion fallback. The selected folder is stored in the app's configuration directory. No recording or private image is bundled or committed.

## Build

Requires an Apple Silicon Mac, Xcode command-line tools, Rust, Bun, and an internet connection for the initial dependency/source downloads.

```sh
bun install --frozen-lockfile
bun run desktop:build
```

The package uses Rust and system macOS libraries, with no FFmpeg or FFprobe executables. `mp4-atom` handles standard MP4 box decoding and encoding.

The debug development loop is `bun run tauri dev`. Its Vite development server is a build-time convenience and is not part of the packaged application.

## Architecture

- `src/main.tsx` and `src/App.tsx`: React entry point and desktop workspace.
- `src/hooks/`: library state, transport, synchronization, and native IPC.
- `src/components/`: library, cameras, transport, telemetry, and shadcn Luma controls.
- `src/projection.ts`: independently implemented equidistant fisheye projection and camera interaction.
- `src/style.css`: desktop layout, camera workspace, transport, and settings.
- `src/components/TelemetryPanel.tsx` and `RouteMap.tsx`: recorded speed, sensor graphs, and embedded OpenStreetMap.
- `src/camera-model.ts`: camera orientation basis and upright defaults.
- `src/library-model.ts`: recording type and session labels.
- `src-tauri/src/telemetry.rs`: bounded, read-only COMTEC CSODAT trailer parser.
- `src-tauri/src/map.rs`: fixed-host OSM tile requests and seven-day on-demand cache.
- `src-tauri/src/lib.rs`: command boundary, native folder picker, app paths, lifecycle.
- `src-tauri/src/media.rs`: discovery, immutable source identities, and operation cancellation.
- `src-tauri/src/tracks.rs`: virtual MP4 indexes, original-file range reads, and direct-playback validation.

Rust only accepts IDs from its discovered library. The in-process `track:` protocol exposes the active recording's camera views and checks original-file identity on each request. Tauri's asset protocol is scoped only to cached map tiles. The webview cannot read arbitrary paths or run arbitrary commands. Production CSP prevents remote scripts and frontend network API calls. Rust fetches only validated tile coordinates from the fixed OpenStreetMap tile host. No recording is uploaded. See [DIRECT_PLAYBACK.md](DIRECT_PLAYBACK.md) for the format boundary and validation.

The original Python/browser source is archived in [`legacy/browser-viewer/`](legacy/browser-viewer/), with the historical handoff and reference screenshots under [`legacy/`](legacy/README.md). These files are not used by the Tauri build. The original installed viewer remains untouched.

See [REACT_UI.md](REACT_UI.md) for React architecture and the skills/docs used.

## Verification

```sh
bun run lint
bun run build
bun run test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
COMTEC_TEST_ROOT="$HOME/Documents/Dashcam" cargo test --manifest-path src-tauri/Cargo.toml -- --include-ignored --nocapture
```

Use `bun run test` rather than Bun's built-in `bun test` to run the Rust test script.

Real-fixture tests verify camera indexes, original sample bytes, and telemetry. Unit tests cover malformed indexes, byte ranges, folder discovery, and unchanged source identities.

For the native WKWebView smoke suite:

```sh
bun run tauri build --debug
COMTEC_SMOKE_TEST=1 COMTEC_TEST_ROOT="$HOME/Documents/Dashcam" 'src-tauri/target/debug/bundle/macos/COMTEC Studio.app/Contents/MacOS/comtec-desktop'
```

This explicitly opt-in test operates the debug application's controls using the real fixture names documented in the handoff. Its report is written to `~/Library/Caches/app.comtec.studio/native-smoke.json`. Test hooks are compiled out of release builds. Close the test app normally when finished. Do not operate its controls while the smoke test is running.

Native checks cover the 26-recording library, dimensions, paused load, synchronized playback/pause/seek, 2× playback, short-clip completion/replay, audio mute, view reset, and rapid selection. See `VALIDATION.md` for observed results and remaining limits.

## Media notes

This is an independent viewer, not an official COMTEC product. The 240° lens model and default view angles are empirical; correction is approximate. Export is outside this version. Supported originals contain two H.264 video streams and optional AAC audio. Playback preserves the original encoded video and audio. Preallocated source file size does not indicate clip duration.
