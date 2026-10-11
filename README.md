<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Comtec Studio icon">
</p>

<h1 align="center">Comtec Studio</h1>

<p align="center">
  A native macOS viewer for COMTEC two-camera dashcam recordings.<br>
  Front, cabin and rear views, the route on a map, and the sensor trace, played straight from the original files.
</p>

Comtec Studio is an independent project and is not an official COMTEC product.

## What it does

- **Three views from two cameras.** The 360° front camera is unwrapped into separate front and cabin perspectives you can drag to look around and scroll to zoom. The rear camera plays alongside, kept in step by a single playback controller.
- **Seven layouts.** All views, Split, Panorama, Round (the original circular image), or any one camera on its own. Click a camera to fill the window; press Escape to go back.
- **A library that reads like a trip log.** Recordings are grouped by date and session, each session labelled with its first and last recording time. Impact, manual and parking recordings are marked. Search by time, date, session, type or file name, or filter to driving, parking or events.
- **Where and how the car was moving.** Recorded speed, a GPS route with a moving position, and X/Y/Z acceleration graphs you can click to seek. Recordings without GPS show no invented position or speed.
- **Continuous playback.** Playback moves on to the next recording, across sessions, and stops at the last one.
- **Your originals stay untouched.** Footage is opened read-only and played directly, with no converted copies and no FFmpeg.
- **At home on the Mac.** Native window controls, light, dark and system appearance, a resizable and collapsible sidebar, and fullscreen.

## Install

Comtec Studio runs on Apple Silicon Macs with macOS 12 or later. There is no downloadable release yet, so build it once and copy it to Applications:

```sh
bun install --frozen-lockfile
bun run desktop:build
cp -R "src-tauri/target/release/bundle/macos/Comtec Studio.app" /Applications/
```

The build is ad-hoc signed for the Mac that built it. It is not Developer ID signed or notarized, so it is not ready to hand to other people. It has been verified live on one Mac only.

## Using it

On first launch choose **Open recordings folder** and pick the folder or SD card that holds your recordings (the default is `~/Documents/Dashcam`). The app remembers the folder. To switch later, use the folder button beside the library name at the bottom of the sidebar. Hidden files, symlinks and `Preview` directories are skipped.

Keep the drive connected while playing: recordings are read from where they are.

| Action                    | How                                                                             |
| ------------------------- | ------------------------------------------------------------------------------- |
| Play or pause             | Space                                                                           |
| Seek five seconds         | ← and →                                                                         |
| Fullscreen                | F                                                                               |
| Search the library        | ⌘K                                                                              |
| Expand a camera           | Click it; Escape restores the layout                                            |
| Look around, zoom         | Drag and scroll on the front or cabin view                                      |
| Pan a focused camera      | Arrow keys                                                                      |
| Resize the sidebar        | Drag its edge, or focus the edge and use the arrow keys; double-click resets it |
| Hide or show the sidebar  | The button beside the app name, or drag the edge shut                           |
| Fold a session away       | Select the open session again                                                   |
| Close Map or Acceleration | Its × button; restore from the transport strip                                  |
| Resize the panels         | Drag the divider above them                                                     |

Other details:

- Cabin starts upright and has a 180° rotation button.
- The acceleration graph switches between raw values (including gravity) and sample-to-sample change (Δg). Axis colours follow the original viewer: green forward/back, red left/right, purple up/down.
- Settings holds appearance, playback information and the shortcut list.
- Recordings in an unsupported layout show an error. There is no conversion fallback.

## Privacy

Recordings never leave your Mac. Playback needs no network connection, server or helper process.

The map is the one exception: street tiles come from OpenStreetMap, so viewing a route tells OpenStreetMap which area you are looking at and your IP address. Routes and sensor data themselves stay local. Tiles are cached for seven days.

The selected folder is stored in the app's configuration directory. No recording or private image is bundled with the app or committed to this repository.

## Build from source

Requires an Apple Silicon Mac, Xcode command-line tools, Rust, Bun, and an internet connection for the first dependency download.

```sh
bun install --frozen-lockfile
bun run desktop:build
```

The packaged app is written to `src-tauri/target/release/bundle/macos/Comtec Studio.app`. It uses Rust and system macOS libraries only; `mp4-atom` handles MP4 box decoding and encoding.

For development, run `bun run tauri dev`. The Vite server it starts is a development convenience and is not part of the packaged app.

Built with Tauri 2, React 19, TypeScript, Tailwind 4, shadcn components, Rust, and a WebGL fisheye renderer.

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
COMTEC_SMOKE_TEST=1 COMTEC_TEST_ROOT="$HOME/Documents/Dashcam" 'src-tauri/target/debug/bundle/macos/Comtec Studio.app/Contents/MacOS/comtec-desktop'
```

This explicitly opt-in test operates the debug application's controls using the real fixture names documented in the handoff. Its report is written to `~/Library/Caches/app.comtec.studio/native-smoke.json`. Test hooks are compiled out of release builds. Close the test app normally when finished. Do not operate its controls while the smoke test is running.

Native checks cover the 26-recording library, dimensions, paused load, synchronized playback/pause/seek, 2× playback, short-clip completion/replay, audio mute, view reset, and rapid selection. See `VALIDATION.md` for observed results and remaining limits.

## Media notes

The 240° lens model and default view angles are empirical; correction is approximate. Export is outside this version. Supported originals contain two H.264 video streams and optional AAC audio. Playback preserves the original encoded video and audio. Preallocated source file size does not indicate clip duration.

## License

Released under the [MIT License](LICENSE).
