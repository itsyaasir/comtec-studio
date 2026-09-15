# COMTEC Viewer: Tauri migration handoff

## Goal and current boundary

The user wants a real local Mac application for their COMTEC dashcam recordings, without Windows, Parallels, or uploads. A working browser-based viewer already exists. The user chose Tauri after learning that the installed `.app` is only a launcher for a Python server and browser, and requested this development project and context dump to continue in a new session.

This directory contains the working source baseline, not a completed Tauri application. Tauri configuration, Rust application code, and bundled media helpers have not been created. Continue the conversion here rather than rebuilding the camera viewer from scratch. Preserve existing playback behavior while replacing the runtime.

## Files and local environment

- Development project: `/Users/yasirdev/Dev/Code/Desktop/comtec-viewer`.
- Installed browser-viewer source: `/Users/yasirdev/Applications/COMTEC Viewer`.
- Installed launcher: `/Users/yasirdev/Applications/COMTEC Viewer.app`.
- Original recordings: `/Users/yasirdev/Documents/Dashcam`.
- Existing sample conversions: `/Users/yasirdev/Documents/Dashcam/Preview`.
- Current remux cache: `/Users/yasirdev/Library/Caches/COMTEC Viewer`.
- Existing viewer URL: `http://127.0.0.1:47731`.

The five implementation files in this directory are exact copies of the installed source at handoff. The development launcher resolves its adjacent `server.py`; the installed AppleScript launcher was intentionally not copied because it points at the installed application directory. The running installed viewer still uses its original source, so editing this project does not change that process.

The machine is an Apple Silicon M4 Pro Mac. Python, FFmpeg, and FFprobe are installed at `/opt/homebrew/bin/python3`, `/opt/homebrew/bin/ffmpeg`, and `/opt/homebrew/bin/ffprobe`. Toolchain checks returned Cargo 1.98.1, Rust 1.98.1, and Bun 1.3.1. `xcode-select -p` returned `/Library/Developer/CommandLineTools`; a full Xcode installation and Tauri build prerequisites have not been verified. Chrome was used for browser verification. WKWebView has not been verified.

### Run the baseline independently

Run the following from this project directory:

```sh
./Start\ Viewer.command --port 47732
```

The launcher starts Python and opens `http://127.0.0.1:47732`. Leave its Terminal process running while using it; stop it with Ctrl+C. Use the separate port during development: the default port is 47731, and `--open` reuses an already-running viewer on that port, which could otherwise show the installed source rather than your edits.

For a foreground server without automatically opening a browser:

```sh
/opt/homebrew/bin/python3 server.py --port 47732
```

The server also accepts `--root PATH`. Its default is `~/Documents/Dashcam`. Recordings and cached video remain outside this repository. Media extensions and generated build artifacts are gitignored.

## Recording facts established in the previous session

The library contains 26 original MP4 recordings grouped under `20260915_002` through `20260915_005`. Many files are approximately 304 MiB because of preallocation; file size is not a reliable duration estimate. Most driving clips are approximately 60 seconds, one is about 6.4 seconds, and parking recordings can be longer.

The inspected originals contain three streams:

| Stream  | Content                                                            |
| ------- | ------------------------------------------------------------------ |
| Video 0 | H.264, 1856 × 1856, circular fisheye covering the front and cabin. |
| Video 1 | H.264, 1920 × 1080, rear camera.                                   |
| Audio 2 | AAC audio.                                                         |

A normal player does not provide the useful front/cabin framing and rear-camera presentation together. The solution separates the existing camera streams losslessly, then renders two independent views from video 0 on the GPU. Front and cabin share one decoded source video, while rear uses a second synchronized video element.

Useful real fixtures, kept outside the project:

- Bright parking garage: `20260915_002/000_023859_A.mp4`.
- Night driving: `20260915_004/000_025643_A.mp4`.
- Short recording: `015_025359_A.mp4`; locate it within the source folders.

The footage examined includes a bright garage and nighttime driving, not a daylight road example. Existing sample exports in `Preview` were approved by the user and should remain unchanged.

## Implementation map

### Frontend

`index.html` and `style.css` provide the recording library, three camera panels, transport controls, status messages, and responsive layout. `app.js` owns selection, preparation polling, playback synchronization, seeking, audio, playback speed, fullscreen, and rendering orchestration. `renderer.js` exports `FisheyeView` and implements WebGL projection plus pointer, wheel, keyboard, and resize behavior. These are plain JavaScript ES modules; no frontend framework or package manager configuration exists yet.

The hidden main video carries audio and acts as the playback clock. The rear video is muted. Front and cabin canvases sample the same main video. Playback begins paused; selecting another clip also stays paused. Selection uses a generation counter and AbortController so a slow previous load cannot replace the latest selected clip. Rear playback is corrected when drift exceeds approximately 120 ms. Buffering pauses coordinated playback.

Fullscreen targets the `.review` container, not just the camera stage, so playback controls and the exit button remain accessible. Preserve this fix when moving into a native window.

### Fisheye rendering

`FisheyeView(canvas, video, { yaw, pitch, fov, onChange })` provides `setView`, `getView`, `draw`, and `destroy`. Angles are in degrees. Current front defaults are yaw 0, pitch 70, and horizontal FOV 100. Cabin defaults are yaw 0, pitch -45, and FOV 110.

The projection approximates an equidistant 240-degree circular fisheye. It rotates a rectilinear ray by pitch and yaw, computes its angular distance from the optical axis, and maps that distance into the source image radius. These values were visually compared against FFmpeg-generated samples using real garage footage. They are useful empirical calibration, not official COMTEC lens metadata.

The renderer caches uploaded video frames and redraws only when a frame or view changes. Resize and seek events refresh paused views. WebGL loss and restoration feed the interface status. Preserve the existing implementation rather than replacing it with a generic panoramic shader whose projection conventions differ.

### Python backend to replace

`server.py` discovers recordings, probes streams, creates cache entries, serves media with byte ranges, and serves the frontend. It binds only to loopback, restricts static paths, rejects foreign origins and hosts, and excludes Preview, hidden directories, and unsafe source paths during discovery.

Current API contract:

- `GET /api/health`: application identity.
- `GET /api/clips`: `{ root, clips: [{ id, name, folder, size }] }`.
- `POST /api/clips/{id}/prepare`: start or reuse preparation.
- `GET /api/clips/{id}`: status with `state` equal to `idle`, `preparing`, `ready`, or `error`; ready results include `duration`, `mainUrl`, and `rearUrl`.
- `GET /media/{id}/main.mp4` and `rear.mp4`: range-capable cached media.

Clip IDs incorporate source path, size, and modification time. A single preparation worker writes temporary outputs and publishes readiness atomically. Main output copies video 0 and optional audio; rear output copies video 1 without audio. There is no video reencoding. Timestamp alignment and overlapping playback duration are handled in the backend; retain these details when porting, rather than simply splitting streams and assuming their clocks match.

Read `Library` in `server.py` for the exact probe, FFmpeg arguments, invalidation, and failure handling. A recording without its rear-camera track produces a useful error rather than a fabricated fallback. Cache entries consume extra disk space, and the current viewer has no eviction or clear-cache UI.

## Tauri direction and unresolved decisions

The intended result is a Tauri v2 macOS application with its own native window, Rust-managed file access and clip preparation, and packaged media helper executables. The finished application should launch without Terminal, Python, a separate browser, or a separately managed localhost server.

Reuse the existing frontend and renderer unless an observed WKWebView limitation requires a change. A framework rewrite is not required. A native recording-folder picker and explicit cache management are sensible desktop improvements discussed previously, but their exact UX is not specified.

Resolve the following through implementation and real playback checks:

1. Verify H.264/AAC playback and WebGL video texture upload inside the actual Tauri WKWebView using the garage and night clips. Chrome success does not establish WebKit compatibility.
2. Choose a Tauri-supported local media delivery mechanism that supports byte ranges and seeking. Scope access to the chosen recording directory and application cache; do not grant arbitrary filesystem access to the frontend. Preserve synchronized seeking across both video sources.
3. Move preparation and cache ownership into Rust commands and background work. Register commands and grant only the required Tauri v2 capabilities. Preserve stale-selection protection across the new IPC boundary.
4. Package arm64 FFmpeg and FFprobe helpers for macOS. Determine their dynamic-library dependencies and applicable licenses before bundling; copying Homebrew executables alone does not prove a self-contained application. Resolve helpers through application paths, not hardcoded Homebrew paths.
5. Verify native application startup, shutdown, and preparation cancellation. Child processes should have a deliberate lifecycle rather than surviving a closed application accidentally.

GPS extraction, map overlays, telemetry, export workflows, and non-Mac distribution are not part of the established scope. Lens correction remains approximate unless additional calibration evidence becomes available. This is an independent custom viewer, not an official COMTEC application.

## Existing verification and acceptance for the migration

The browser baseline was exercised with actual recordings, not only mocked media. Checks covered paused initial load, synchronized play and pause, seeking both streams to 25 seconds, 2× playback, rapid clip switching, drag/zoom/reset, short-clip completion and replay, mute, fullscreen playback and exit, and responsive layouts from 375 to 1440 pixels wide. Observed rear/main drift during two playback checks was approximately 63 ms and 12 ms; these observations are not a guarantee for every recording.

Backend checks covered real remux preparation, ordinary and suffix byte ranges, out-of-range requests, foreign origin/host rejection, and an unsupported single-camera recording. Stopping the local server produced an actionable connection error; restarting it and refreshing restored the 26-recording library.

These were live smoke checks, not a committed automated test suite. Do not describe them as Tauri verification. Acceptance for the conversion is an actual macOS `.app` that plays the same real fixtures with all three views, synchronized transport, useful errors, and no dependency on the Python viewer process. A compiling Tauri shell or a window that merely loads the existing HTTP service does not meet that target.

Keep the original recordings and existing Preview exports read-only. Preserve the installed working viewer until the replacement passes those checks. No recording files, cache media, or private footage should enter Git.
