<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Dashreel icon">
</p>

<h1 align="center">Dashreel</h1>

<p align="center">
  A native macOS viewer for COMTEC two-camera dashcam recordings.<br>
  Front, cabin and rear views, the route on a map, and the sensor trace, played straight from the original files.
</p>

## What it does

- **Three views from two cameras.** The 360° front camera is unwrapped into front and cabin views you can drag to look around and scroll to zoom. The rear camera plays in step alongside.
- **A library that reads like a trip log.** Recordings are grouped by date and session, with impact, manual and parking recordings marked. Search or filter to find one.
- **Where and how the car was moving.** Recorded speed, the GPS route with a moving position, and acceleration graphs you can click to seek.
- **Your originals stay untouched.** Footage is opened read-only and played directly, with no converted copies.

## Get started

Dashreel runs on Apple Silicon Macs with macOS 12 or later. There is no downloadable release yet, so build it once. You need Xcode command-line tools, Rust and Bun.

```sh
bun install --frozen-lockfile
bun run desktop:build
cp -R "src-tauri/target/release/bundle/macos/Dashreel.app" /Applications/
```

Open Dashreel, choose **Open recordings folder**, and pick the folder or SD card that holds your recordings. Keep the drive connected while playing.

Space plays and pauses, ← and → seek five seconds, F is fullscreen and ⌘K searches the library. The full list is in Settings.

## Privacy

Recordings never leave your Mac. The one network request is for map tiles, which come from OpenStreetMap, so viewing a route tells OpenStreetMap which area you are looking at.

## License

Released under the [MIT License](LICENSE). Dashreel is an independent project, not made by, affiliated with or endorsed by COMTEC.
