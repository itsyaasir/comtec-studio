# COMTEC Studio

A standalone Apple Silicon macOS application for reviewing original two-camera COMTEC recordings. Built from scratch with Tauri v2, TypeScript, Rust, and a WebGL fisheye renderer.

## Open the app

The finished app is installed at `~/Applications/COMTEC Studio.app`. Double-click it to launch. A build copy is also available in `src-tauri/target/release/bundle/macos`. It can be copied to Applications. It has a distinct name and bundle identifier and does not replace COMTEC Viewer.

The app contains its frontend and media helpers. Playback needs no Terminal, Python, Homebrew, separate browser, network connection, or localhost server. The embedded OpenStreetMap street layer uses an internet connection; recorded GPS routes and sensor data remain local. Map tile requests disclose the viewed area and your IP address to OpenStreetMap. The current build is locally ad-hoc signed for Apple Silicon. It is not Developer ID signed or notarized for public distribution. macOS 12+ is the build target; live verification was performed on this Mac only.

Choose **Open recordings folder**, then select a clip. The default first-run location is the user's Documents/Dashcam folder. The app remembers the selected folder. Hidden files, symlinks, and Preview directories are excluded.

- Front and cabin are independently adjustable perspectives from the circular video track.
- Rear uses the second camera track. Both videos share playback controls and timing.
- Drag a camera to look around; scroll to zoom; use reset to restore its default view.
- Choose All views, Front, Split (front/cabin), Panorama, Round (original circular image), Cabin, or Rear. Cabin starts upright and includes a 180° rotation button.
- The folder column groups clips by recording date/session. Select a folder to see its clips, or search across the library. Driving, parking, and event filters use COMTEC file types.
- The telemetry panel shows recorded km/h, recording time, a GPS route with a moving position, and X/Y/Z acceleration graphs. Click the graph to seek. GPS-unavailable recordings show no invented position or zero speed.
- Switch between raw acceleration (including gravity) and sample-to-sample changes (Δg). Axis colors follow the original viewer: green forward/backward, red left/right, purple up/down.
- Space plays or pauses; left/right arrows seek five seconds. Focused camera arrow keys pan instead.
- F toggles native fullscreen, retaining the transport controls.
- Settings includes playback-cache size, cache clearing, and keyboard shortcuts.

Original footage is opened read-only. Lossless, separately playable camera tracks are written to `~/Library/Caches/app.comtec.studio/media`. Clearing this cache never targets the recordings folder or the previous viewer's cache. The selected folder is stored in the app's configuration directory. No recording or private image is bundled or committed.

## Build

Requires an Apple Silicon Mac, Xcode command-line tools, Rust, Bun, and an internet connection for the initial dependency/source downloads.

```sh
bun install --frozen-lockfile
./scripts/build-media.sh
bun run desktop:build
```

The helper script downloads the checksum-pinned official FFmpeg 8.0.1 source, builds minimal static FFmpeg/FFprobe executables with no network support, checks their dynamic dependencies, and includes the matching source, license, and build instructions in the application bundle. The helpers link only to macOS system libraries. They are invoked by Rust using bundle-relative paths; the frontend has no shell-execution permission.

The debug development loop is `bun run tauri dev`. Its Vite development server is a build-time convenience and is not part of the packaged application.

## Architecture

- `src/main.ts`: desktop workspace, library state, transport, synchronization, native IPC.
- `src/projection.ts`: independently implemented equidistant fisheye projection and camera interaction.
- `src/style.css`: desktop layout, camera workspace, transport, and settings.
- `src/telemetry.ts`: embedded OpenStreetMap route, speed, and acceleration graphs.
- `src/camera-model.ts`: camera orientation basis and upright defaults.
- `src/library-model.ts`: recording type and session labels.
- `src-tauri/src/telemetry.rs`: bounded, read-only COMTEC CSODAT trailer parser.
- `src-tauri/src/map.rs`: fixed-host OSM tile requests and seven-day on-demand cache.
- `src-tauri/src/lib.rs`: command boundary, native folder picker, app paths, lifecycle.
- `src-tauri/src/media.rs`: discovery, immutable source identities, probing, remuxing, cancellation, cache validation.

Rust only accepts IDs from its discovered library for preparation. Preparation uses a serialized worker and cancellable child processes. Outputs retain a common timestamp origin and the playable overlapping interval. Staged media becomes ready only after both outputs have been probed and the recording identity is rechecked. Tauri's range-capable asset protocol is scoped to this app's media cache. The webview cannot read arbitrary paths or run arbitrary commands. Production CSP prevents remote scripts and frontend network API calls. Rust fetches only validated tile coordinates from the fixed OpenStreetMap tile host. No recording is uploaded.

The original Python/browser source is archived in [`legacy/browser-viewer/`](legacy/browser-viewer/), with the historical handoff and reference screenshots under [`legacy/`](legacy/README.md). These files are not used by the Tauri build. The original installed viewer remains untouched.

## Verification

```sh
bun run build
bun run test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
COMTEC_TEST_ROOT="$HOME/Documents/Dashcam" cargo test --manifest-path src-tauri/Cargo.toml -- --include-ignored --nocapture
```

Use `bun run test` rather than Bun's built-in `bun test` to run the Rust test script.

Real-fixture tests prepare garage, night, and short recordings using the bundled helpers and a disposable temporary cache. They check cache reuse and unchanged source identities. Unit tests cover stream timing, invalid duration/codecs, excluded files, identity invalidation, and child-process cancellation.

For the native WKWebView smoke suite:

```sh
bun run tauri build --debug
COMTEC_SMOKE_TEST=1 COMTEC_TEST_ROOT="$HOME/Documents/Dashcam" 'src-tauri/target/debug/bundle/macos/COMTEC Studio.app/Contents/MacOS/comtec-desktop'
```

This explicitly opt-in test operates the debug application's controls using the real fixture names documented in the handoff. Its report is written to `~/Library/Caches/app.comtec.studio/native-smoke.json`. Test hooks are compiled out of release builds. Close the test app normally when finished. Do not operate its controls while the smoke test is running.

Native checks cover the 26-recording library, dimensions, paused load, synchronized playback/pause/seek, 2× playback, short-clip completion/replay, audio mute, view reset, and rapid selection. See `VALIDATION.md` for observed results and remaining limits.

## Media notes

This is an independent viewer, not an official COMTEC product. The 240° lens model and default view angles are empirical; correction is approximate. Export is outside this version. Supported originals contain two H.264 video streams and optional AAC audio. Preparation preserves encoded video and audio rather than reencoding. Preallocated source file size does not indicate clip duration.

FFmpeg licensing information: https://ffmpeg.org/legal.html. The bundled helpers use LGPL 2.1-or-later components; GPL and nonfree components are disabled. The exact source archive and license are available under `Contents/Resources/resources/media` in the app.
